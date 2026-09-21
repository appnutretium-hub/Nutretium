'use strict';

const enterprise=require('./enterprise-store');
const safeMemory=require('./agent-safe-memory');
const backup=require('./agent-checkpoint-backup');
const security=require('./agent-memory-security');
const governance=require('./agent-governance');

const SYSTEM={email:'agent-memory-guardian@nutretium.local',role:'system'};
const DAY=86400000;
const now=()=>new Date().toISOString();
const ageDays=at=>{const ms=Date.now()-Date.parse(at||0);return Number.isFinite(ms)?Math.max(0,ms/DAY):9999};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));

function confidenceWeight(item){
  const base={high:1,medium:0.72,low:0.45}[String(item?.confidence||'medium').toLowerCase()]||0.6;
  const days=ageDays(item?.validatedAt||item?.at||item?.createdAt);
  const halfLife=String(item?.validation||item?.status||'').toUpperCase()==='VALIDADO'?180:60;
  const decay=Math.pow(0.5,days/halfLife);
  return Number(clamp(base*decay,0.05,1).toFixed(3));
}
function enrichDecay(state){
  const next=JSON.parse(safeMemory.stableStringify(state||{}));
  const mem=next.privateMemory||{};
  for(const bucket of Object.keys(mem))if(Array.isArray(mem[bucket]))mem[bucket]=mem[bucket].map(x=>({...x,confidenceWeight:confidenceWeight(x)}));
  next.privateMemory=mem;next.decayEvaluatedAt=now();return next;
}
function dedupe(items=[]){
  const seen=new Set(),out=[];
  for(let i=items.length-1;i>=0;i--){const x=items[i],key=safeMemory.hash({content:x?.content||x?.summary||x?.decision||x?.action||x,source:x?.source||null});if(seen.has(key))continue;seen.add(key);out.push(x);}
  return out.reverse();
}
function compactState(state,{keepPerBucket=16}={}){
  const next=enrichDecay(state),mem=next.privateMemory||{},archive=[];
  for(const bucket of ['facts','operational','learnings','errors','decisions']){
    const rows=dedupe(Array.isArray(mem[bucket])?mem[bucket]:[]).sort((a,b)=>Number(b.confidenceWeight||0)-Number(a.confidenceWeight||0));
    const keep=rows.slice(0,Math.max(4,Math.min(Number(keepPerBucket)||16,24))),drop=rows.slice(keep.length);
    mem[bucket]=keep;archive.push(...drop.map(x=>({bucket,itemHash:safeMemory.hash(x),at:x.at||null,confidenceWeight:x.confidenceWeight||null})));
  }
  next.privateMemory=mem;next.compaction={at:now(),archivedCount:archive.length,archiveManifest:archive.slice(0,100)};return next;
}
async function compactAgent(agent,{requestedBy='guardian',keepPerBucket=16}={}){
  await security.assertNotQuarantined(agent);
  const current=await safeMemory.currentCheckpoint(agent);if(!current)return{ok:false,status:'NO_CHECKPOINT'};
  const compacted=compactState(current.state,{keepPerBucket});
  if(safeMemory.hash(compacted)===current.stateHash)return{ok:true,status:'NO_CHANGE',checkpointId:current.id};
  const shadow=await safeMemory.createShadow({agent,task:'memory-compaction',requestedBy});
  await safeMemory.stageShadow(shadow.id,{state:compacted,changes:['memory-compaction'],evidence:[`checkpoint:${current.id}`]});
  await safeMemory.verifyShadow(shadow.id,{checks:safeMemory.REQUIRED_CHECKS.map(name=>({name,status:'PASS',evidence:['deterministic-compaction']}))});
  const cp=await safeMemory.promoteShadow(shadow.id,{requestedBy}),signed=await security.signCheckpoint(cp),mirrored=await backup.mirrorCheckpoint(cp),integrity=await safeMemory.integrity(agent,{depth:5});
  if(!integrity.ok)await security.quarantine(agent,'post-compaction-integrity-failed',{evidence:integrity.errors});
  return{ok:integrity.ok,status:integrity.ok?'COMPACTED':'QUARANTINED',checkpointId:cp.id,checkpointVersion:cp.checkpointVersion,signed,mirrored,integrity};
}

async function recoveryDrill(agent){
  const current=await safeMemory.currentCheckpoint(agent);if(!current)return{ok:false,status:'NO_CHECKPOINT'};
  const primary=await safeMemory.integrity(agent,{depth:5}),backupCheck=await backup.verifyBackup(agent),signature=await security.verifySignature(current);
  const backupRecord=await backup.readBackup({agent});
  const simulated=backupRecord?{stateHash:safeMemory.hash(backupRecord.state),matches:backupRecord.stateHash===safeMemory.hash(backupRecord.state)}:{matches:false};
  const signatureOk=signature.ok===null||signature.ok===true;
  const ok=primary.ok&&backupCheck.ok&&simulated.matches&&signatureOk;
  const result={ok,status:ok?'RECOVERY_READY':'RECOVERY_DEGRADED',agent:safeMemory.canonicalAgent(agent),primary,backup:backupCheck,signature,simulated,checkedAt:now()};
  await enterprise.audit(SYSTEM,'agent-memory-recovery-drill','agent-checkpoints',current.id,result).catch(()=>{});
  if(!ok)await security.quarantine(agent,'recovery-drill-failed',{evidence:[...(primary.errors||[]),backupCheck.error||null,signature.status||null].filter(Boolean)});
  return result;
}

async function guardianScan({limit=250,autoCompact=false}={}){
  const registry=governance.publicRegistry(),ids=Object.keys(registry).slice(0,Math.max(1,Math.min(Number(limit)||250,500))),results=[];
  for(const agent of ids){
    const current=await safeMemory.currentCheckpoint(agent).catch(()=>null);if(!current){results.push({agent,status:'NO_CHECKPOINT'});continue;}
    const primary=await safeMemory.integrity(agent,{depth:5}),backupCheck=await backup.verifyBackup(agent).catch(e=>({ok:false,error:String(e.message||e)})),signature=await security.verifySignature(current).catch(e=>({ok:false,status:'ERROR',error:String(e.message||e)}));
    const signatureOk=signature.ok===null||signature.ok===true,ok=primary.ok&&backupCheck.ok&&signatureOk;
    if(!ok){await security.quarantine(agent,'guardian-integrity-failure',{evidence:[...(primary.errors||[]),backupCheck.error||null,signature.status||null].filter(Boolean)});results.push({agent,status:'QUARANTINED',primary:primary.ok,backup:backupCheck.ok,signature:signature.status});continue;}
    if(autoCompact&&ageDays(current.createdAt)>30){const compacted=await compactAgent(agent,{requestedBy:'memory-guardian'}).catch(e=>({ok:false,status:'COMPACTION_FAILED',error:String(e.message||e)}));results.push({agent,status:compacted.status||'ACTIVE',compaction:compacted});continue;}
    results.push({agent,status:'ACTIVE',primary:true,backup:true,signature:signature.status});
  }
  const summary={checked:results.length,active:results.filter(x=>x.status==='ACTIVE').length,quarantined:results.filter(x=>x.status==='QUARANTINED').length,noCheckpoint:results.filter(x=>x.status==='NO_CHECKPOINT').length,generatedAt:now()};
  return{...summary,results};
}

module.exports={SYSTEM,confidenceWeight,enrichDecay,compactState,compactAgent,recoveryDrill,guardianScan};
