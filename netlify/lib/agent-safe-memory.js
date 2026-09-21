'use strict';

const crypto=require('crypto');
const enterprise=require('./enterprise-store');
const governance=require('./agent-governance');

const SYSTEM={email:'agent-safe-memory@nutretium.local',role:'system'};
const DOMAINS=Object.freeze({
  heads:'agent-checkpoint-heads',
  checkpoints:'agent-checkpoints',
  shadows:'agent-shadow-workspaces',
  locks:'agent-promotion-locks',
  journal:'agent-recovery-journal',
});
const REQUIRED_CHECKS=Object.freeze(['integrity','policy','source_validation','regression']);
const MAX_STATE_BYTES=96*1024;
const MAX_PRIVATE_ITEMS=30;
const SECRET_KEY=/(password|passwd|contrase(?:ña|na)|secret|token|api[_-]?key|authorization|cookie|private[_-]?key)/i;

const now=()=>new Date().toISOString();
const safe=v=>String(v||'').trim().toLowerCase();

function canonicalAgent(input){
  const raw=safe(input);if(!raw)throw new Error('Agente no indicado.');
  const legacy=governance.profile(raw);
  if(legacy?.source==='legacy')return raw;
  const role=raw.replace(/^workforce__/,'');
  if(governance.workforce.getRole(role))return governance.workforceAgentId(role);
  const p=governance.profile(raw);if(!p)throw new Error('Agente no reconocido.');
  return p.agent;
}
function normalized(value){
  if(Array.isArray(value))return value.map(normalized);
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalized(value[k])]));
  return value;
}
function stableStringify(value){return JSON.stringify(normalized(value));}
function hash(value){return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');}
function hasSecretKey(value){
  if(Array.isArray(value))return value.some(hasSecretKey);
  if(!value||typeof value!=='object')return false;
  for(const [k,v] of Object.entries(value)){if(SECRET_KEY.test(k))return true;if(hasSecretKey(v))return true;}
  return false;
}
function validateState(state){
  if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('El estado del agente debe ser un objeto JSON.');
  if(hasSecretKey(state))throw new Error('AGENT_MEMORY_SECRET_BLOCKED: la memoria privada no puede contener secretos o credenciales.');
  const raw=stableStringify(state);if(Buffer.byteLength(raw,'utf8')>MAX_STATE_BYTES)throw new Error('AGENT_MEMORY_STATE_TOO_LARGE');
  return JSON.parse(raw);
}
function profileFingerprint(agent){
  const p=governance.profile(canonicalAgent(agent));if(!p)throw new Error('Agente no reconocido.');
  return hash({agent:p.agent,source:p.source,roleId:p.roleId||null,department:p.department,scopes:p.scopes,autonomous:p.autonomous,sensitive:p.sensitive,reportsTo:p.reportsTo||null});
}
function emptyState(agent){return{schemaVersion:1,agent:canonicalAgent(agent),privateMemory:{facts:[],operational:[],learnings:[],errors:[],decisions:[]},lastVerifiedRun:null,updatedAt:null};}
function trimPrivate(state){
  const next={...state,privateMemory:{...(state.privateMemory||{})}};
  for(const k of ['facts','operational','learnings','errors','decisions'])next.privateMemory[k]=Array.isArray(next.privateMemory[k])?next.privateMemory[k].slice(-MAX_PRIVATE_ITEMS):[];
  return next;
}
async function journal(agent,event,detail={}){
  const id=crypto.randomUUID(),record={id,agent:canonicalAgent(agent),event:String(event),detail,at:now()};
  await enterprise.save(DOMAINS.journal,record,SYSTEM,{id,create:true,reason:`agent-journal:${event}`});return record;
}
async function head(agent){return enterprise.get(DOMAINS.heads,canonicalAgent(agent)).catch(()=>null)}
async function checkpoint(id){return enterprise.get(DOMAINS.checkpoints,String(id||'')).catch(()=>null)}
async function currentCheckpoint(agent){const h=await head(agent);return h?.checkpointId?checkpoint(h.checkpointId):null}
async function checkpointForShadow(shadowId,agent){
  const a=canonicalAgent(agent),rows=await enterprise.list(DOMAINS.checkpoints,{limit:500}).catch(()=>[]);
  return rows.find(x=>x.agent===a&&x.promotedFromShadowId===String(shadowId||''))||null;
}

async function bootstrap(agent,{state=null,reason='bootstrap',evidence=[]}={}){
  const idAgent=canonicalAgent(agent),existing=await head(idAgent);if(existing)return checkpoint(existing.checkpointId);
  const clean=validateState(trimPrivate(state||emptyState(idAgent))),id=crypto.randomUUID(),createdAt=now();clean.updatedAt=createdAt;
  const record={id,agent:idAgent,checkpointVersion:1,state:clean,stateHash:hash(clean),profileHash:profileFingerprint(idAgent),previousCheckpointId:null,reason,evidence:Array.isArray(evidence)?evidence.slice(0,20):[],verification:{status:'VALIDADO',checks:[{name:'integrity',status:'PASS',evidence:['bootstrap-hash']},{name:'policy',status:'PASS',evidence:['governance-profile']},{name:'source_validation',status:'PASS',evidence:['bootstrap-empty-or-supplied-state']},{name:'regression',status:'PASS',evidence:['genesis']}],verifiedAt:createdAt},createdAt};
  try{
    const saved=await enterprise.save(DOMAINS.checkpoints,record,SYSTEM,{id,create:true,reason:'agent-checkpoint-bootstrap'});
    await enterprise.save(DOMAINS.heads,{id:idAgent,agent:idAgent,checkpointId:id,checkpointHash:saved.stateHash,checkpointVersion:1,profileHash:saved.profileHash,updatedAt:createdAt},SYSTEM,{id:idAgent,create:true,reason:'agent-head-bootstrap'});
    await journal(idAgent,'CHECKPOINT_BOOTSTRAPPED',{checkpointId:id,stateHash:saved.stateHash,checkpointVersion:1});return saved;
  }catch(error){const won=await currentCheckpoint(idAgent);if(won)return won;throw error;}
}

async function createShadow({agent,task='work',requestedBy='system'}={}){
  const idAgent=canonicalAgent(agent),base=await bootstrap(idAgent),id=crypto.randomUUID(),createdAt=now();
  const state=validateState(base.state),record={id,agent:idAgent,task:String(task||'work').slice(0,120),requestedBy:String(requestedBy||'system').slice(0,200),status:'open',baseCheckpointId:base.id,baseCheckpointVersion:Number(base.checkpointVersion||1),baseStateHash:base.stateHash,profileHash:profileFingerprint(idAgent),state,stateHash:hash(state),changes:[],evidence:[],verification:null,createdAt,updatedAt:createdAt};
  await enterprise.save(DOMAINS.shadows,record,SYSTEM,{id,create:true,reason:'agent-shadow-create'});await journal(idAgent,'SHADOW_CREATED',{shadowId:id,baseCheckpointId:base.id,task:record.task});return record;
}
async function shadow(id){return enterprise.get(DOMAINS.shadows,String(id||'')).catch(()=>null)}
async function stageShadow(id,{state,changes=[],evidence=[]}={}){
  const current=await shadow(id);if(!current)throw new Error('Shadow workspace no encontrado.');if(current.status!=='open')throw new Error(`Shadow no editable: ${current.status}`);
  const clean=validateState(trimPrivate(state||current.state)),updated={...current,state:clean,stateHash:hash(clean),changes:Array.isArray(changes)?changes.slice(0,50):[],evidence:Array.isArray(evidence)?evidence.slice(0,50):[],updatedAt:now()};
  return enterprise.save(DOMAINS.shadows,updated,SYSTEM,{id:current.id,reason:'agent-shadow-stage'});
}
function normalizeChecks(checks=[]){
  const map=new Map((Array.isArray(checks)?checks:[]).map(c=>[safe(c?.name),{name:safe(c?.name),status:String(c?.status||'FAIL').toUpperCase(),evidence:Array.isArray(c?.evidence)?c.evidence.slice(0,20):[]}]))
  return REQUIRED_CHECKS.map(name=>map.get(name)||{name,status:'FAIL',evidence:['missing-check']});
}
async function verifyShadow(id,{checks=[]}={}){
  const current=await shadow(id);if(!current)throw new Error('Shadow workspace no encontrado.');if(!['open','verification_failed'].includes(current.status))throw new Error(`Shadow no verificable: ${current.status}`);
  const base=await checkpoint(current.baseCheckpointId);if(!base)throw new Error('Checkpoint base no encontrado.');
  const normalizedChecks=normalizeChecks(checks),integrityOk=hash(current.state)===current.stateHash&&hash(base.state)===base.stateHash&&current.profileHash===profileFingerprint(current.agent);
  const withIntegrity=normalizedChecks.map(c=>c.name==='integrity'?{...c,status:integrityOk&&c.status==='PASS'?'PASS':'FAIL',evidence:[...c.evidence,`state:${current.stateHash}`,`base:${base.stateHash}`]}:c);
  const ok=withIntegrity.every(c=>c.status==='PASS'),verification={status:ok?'VALIDADO':'NO_VALIDADO',checks:withIntegrity,verifiedAt:now(),stateHash:current.stateHash,baseCheckpointId:base.id};
  const updated=await enterprise.save(DOMAINS.shadows,{...current,status:ok?'verified':'verification_failed',verification,updatedAt:now()},SYSTEM,{id:current.id,reason:'agent-shadow-verify'});
  await journal(current.agent,ok?'SHADOW_VERIFIED':'SHADOW_REJECTED',{shadowId:current.id,baseCheckpointId:base.id,checks:withIntegrity});return updated;
}
async function acquirePromotionLock(agent,baseCheckpointId,shadowId){
  const a=canonicalAgent(agent),id=`${a}:${String(baseCheckpointId)}`,existing=await enterprise.get(DOMAINS.locks,id).catch(()=>null);
  if(existing){
    if(existing.shadowId===String(shadowId))return existing;
    const err=new Error('PROMOTION_LOCKED: otro shadow ya posee el lock de esta base.');err.code='PROMOTION_LOCKED';throw err;
  }
  const record={id,agent:a,baseCheckpointId,shadowId:String(shadowId),createdAt:now()};
  try{return await enterprise.save(DOMAINS.locks,record,SYSTEM,{id,create:true,reason:'agent-promotion-lock'});}
  catch(error){const winner=await enterprise.get(DOMAINS.locks,id).catch(()=>null);if(winner?.shadowId===String(shadowId))return winner;throw error;}
}
async function finalizePromotedShadow(current,saved,createdAt=now()){
  const latest=await shadow(current.id);
  if(latest?.status!=='promoted')await enterprise.save(DOMAINS.shadows,{...(latest||current),status:'promoted',promotedCheckpointId:saved.id,promotedAt:createdAt,updatedAt:createdAt},SYSTEM,{id:current.id,reason:'agent-shadow-promoted'});
  return saved;
}
async function promoteShadow(id,{requestedBy='system'}={}){
  const current=await shadow(id);if(!current)throw new Error('Shadow workspace no encontrado.');
  if(current.status==='promoted'&&current.promotedCheckpointId){const done=await checkpoint(current.promotedCheckpointId);if(done)return done;}
  if(current.status!=='verified'||current.verification?.status!=='VALIDADO')throw new Error('Sólo se puede promover un shadow verificado.');
  let h=await head(current.agent);
  if(h&&h.checkpointId!==current.baseCheckpointId){
    const already=await checkpoint(h.checkpointId);
    if(already?.promotedFromShadowId===current.id&&already.stateHash===current.stateHash)return finalizePromotedShadow(current,already,already.createdAt||now());
    throw new Error('STALE_SHADOW: el checkpoint base ya no es el vigente.');
  }
  if(!h||h.checkpointHash!==current.baseStateHash)throw new Error('STALE_SHADOW: el checkpoint base ya no es el vigente.');
  if(current.profileHash!==profileFingerprint(current.agent))throw new Error('POLICY_DRIFT: la política del agente cambió desde que se creó el shadow.');
  await acquirePromotionLock(current.agent,current.baseCheckpointId,current.id);
  let saved=await checkpointForShadow(current.id,current.agent);
  const createdAt=saved?.createdAt||now(),nextVersion=Number(h.checkpointVersion||0)+1;
  if(saved){
    if(saved.previousCheckpointId!==current.baseCheckpointId||saved.stateHash!==current.stateHash)throw new Error('PROMOTION_RECOVERY_MISMATCH');
  }else{
    const clean=validateState(trimPrivate(current.state)),newId=crypto.randomUUID(),record={id:newId,agent:current.agent,checkpointVersion:nextVersion,state:clean,stateHash:hash(clean),profileHash:current.profileHash,previousCheckpointId:current.baseCheckpointId,reason:`promote:${current.task}`,evidence:current.evidence||[],verification:current.verification,promotedFromShadowId:current.id,promotedBy:String(requestedBy||'system').slice(0,200),createdAt};
    saved=await enterprise.save(DOMAINS.checkpoints,record,SYSTEM,{id:newId,create:true,reason:'agent-checkpoint-promote'});
  }
  h=await head(current.agent);
  if(h?.checkpointId===current.baseCheckpointId){
    await enterprise.save(DOMAINS.heads,{id:current.agent,agent:current.agent,checkpointId:saved.id,checkpointHash:saved.stateHash,checkpointVersion:saved.checkpointVersion,profileHash:saved.profileHash,previousCheckpointId:current.baseCheckpointId,updatedAt:createdAt},SYSTEM,{id:current.agent,reason:'agent-head-promote'});
  }else if(h?.checkpointId!==saved.id){throw new Error('STALE_SHADOW: el head cambió durante la recuperación de promoción.');}
  await finalizePromotedShadow(current,saved,createdAt);
  await journal(current.agent,'CHECKPOINT_PROMOTED',{shadowId:current.id,checkpointId:saved.id,previousCheckpointId:current.baseCheckpointId,checkpointVersion:saved.checkpointVersion,stateHash:saved.stateHash});return saved;
}
async function rejectShadow(id,reason='rejected'){
  const current=await shadow(id);if(!current)throw new Error('Shadow workspace no encontrado.');if(current.status==='promoted')throw new Error('No se puede rechazar un shadow ya promovido.');
  const updated=await enterprise.save(DOMAINS.shadows,{...current,status:'rejected',rejectedReason:String(reason).slice(0,500),rejectedAt:now(),updatedAt:now()},SYSTEM,{id:current.id,reason:'agent-shadow-rejected'});await journal(current.agent,'SHADOW_REJECTED',{shadowId:current.id,reason:String(reason).slice(0,500)});return updated;
}
async function rollback(agent,targetCheckpointId,{actor}={}){
  if(!actor||!['owner','admin'].includes(String(actor.role||'')))throw new Error('ROLLBACK_REQUIRES_OWNER_OR_ADMIN');
  const idAgent=canonicalAgent(agent),current=await currentCheckpoint(idAgent),target=await checkpoint(targetCheckpointId);if(!current||!target||target.agent!==idAgent)throw new Error('Checkpoint de rollback no válido.');
  await acquirePromotionLock(idAgent,current.id,`rollback:${target.id}`);
  const createdAt=now(),newId=crypto.randomUUID(),currentGeneration=Number((await head(idAgent))?.checkpointVersion||current.checkpointVersion||1),nextVersion=currentGeneration+1,clean=validateState(target.state),record={id:newId,agent:idAgent,checkpointVersion:nextVersion,state:clean,stateHash:hash(clean),profileHash:profileFingerprint(idAgent),previousCheckpointId:current.id,rollbackFromCheckpointId:current.id,rollbackToCheckpointId:target.id,reason:'rollback',evidence:[`checkpoint:${target.id}`],verification:{status:'VALIDADO',checks:[{name:'integrity',status:'PASS',evidence:[target.stateHash]},{name:'policy',status:'PASS',evidence:['current-profile']},{name:'source_validation',status:'PASS',evidence:['previously-verified-checkpoint']},{name:'regression',status:'PASS',evidence:['explicit-owner-admin-rollback']}],verifiedAt:createdAt},promotedBy:String(actor.email||actor.role),createdAt};
  const saved=await enterprise.save(DOMAINS.checkpoints,record,SYSTEM,{id:newId,create:true,reason:'agent-checkpoint-rollback'});await enterprise.save(DOMAINS.heads,{id:idAgent,agent:idAgent,checkpointId:newId,checkpointHash:saved.stateHash,checkpointVersion:nextVersion,profileHash:saved.profileHash,previousCheckpointId:current.id,updatedAt:createdAt},SYSTEM,{id:idAgent,reason:'agent-head-rollback'});await journal(idAgent,'ROLLBACK_COMPLETED',{from:current.id,toHistorical:target.id,newCheckpointId:newId,checkpointVersion:nextVersion,actor:String(actor.email||actor.role)});return saved;
}
async function integrity(agent,{depth=5}={}){
  const idAgent=canonicalAgent(agent),h=await head(idAgent);if(!h)return{ok:false,agent:idAgent,error:'NO_CHECKPOINT'};
  let id=h.checkpointId,count=0,previous=null;const checked=[],errors=[];
  while(id&&count<Math.max(1,Math.min(Number(depth)||5,20))){const cp=await checkpoint(id);if(!cp){errors.push(`missing:${id}`);break;}const computed=hash(cp.state);if(computed!==cp.stateHash)errors.push(`hash:${id}`);if(cp.agent!==idAgent)errors.push(`agent:${id}`);if(previous&&previous.previousCheckpointId!==cp.id)errors.push(`chain:${previous.id}`);checked.push({id:cp.id,checkpointVersion:cp.checkpointVersion,stateHash:cp.stateHash,computedHash:computed});previous=cp;id=cp.previousCheckpointId;count++;}
  if(checked[0]&&checked[0].stateHash!==h.checkpointHash)errors.push('head-hash');
  if(checked[0]&&Number(checked[0].checkpointVersion)!==Number(h.checkpointVersion))errors.push('head-generation');
  return{ok:errors.length===0,agent:idAgent,head:h,checked,errors};
}
function addPrivateItem(state,bucket,item){
  const next=JSON.parse(stableStringify(state||{}));next.privateMemory=next.privateMemory||{};next.privateMemory[bucket]=Array.isArray(next.privateMemory[bucket])?next.privateMemory[bucket]:[];next.privateMemory[bucket].push({...item,at:item?.at||now()});next.updatedAt=now();return trimPrivate(next);
}
async function recordVerifiedRun({agent,run,requestedBy='system'}={}){
  const idAgent=canonicalAgent(agent),workspace=await createShadow({agent:idAgent,task:`run:${String(run?.action||'unknown')}`,requestedBy});
  let state=addPrivateItem(workspace.state,'operational',{action:run?.action||null,status:run?.status||null,validation:run?.validation||null,runId:run?.runId||null,summary:run?.summary||null});state.lastVerifiedRun={action:run?.action||null,status:run?.status||null,validation:run?.validation||null,runId:run?.runId||null,at:now()};
  await stageShadow(workspace.id,{state,changes:['lastVerifiedRun','privateMemory.operational'],evidence:Array.isArray(run?.evidence)?run.evidence:[]});
  const valid=run?.status==='COMPLETED'&&run?.validation==='VALIDADO'&&run?.requiresHumanDecision!==true;
  const checks=REQUIRED_CHECKS.map(name=>({name,status:valid?'PASS':'FAIL',evidence:[name==='source_validation'?String(run?.validation||'NO_VALIDADO'):'runtime-guard']}));
  const verified=await verifyShadow(workspace.id,{checks});if(verified.status!=='verified'){await rejectShadow(workspace.id,'runtime-output-not-fully-validated');return{promoted:false,shadowId:workspace.id,status:'rejected'};}
  const cp=await promoteShadow(workspace.id,{requestedBy});return{promoted:true,shadowId:workspace.id,checkpointId:cp.id,checkpointVersion:cp.checkpointVersion};
}

module.exports={SYSTEM,DOMAINS,REQUIRED_CHECKS,MAX_STATE_BYTES,MAX_PRIVATE_ITEMS,canonicalAgent,stableStringify,hash,validateState,profileFingerprint,emptyState,head,checkpoint,currentCheckpoint,checkpointForShadow,bootstrap,createShadow,shadow,stageShadow,verifyShadow,acquirePromotionLock,promoteShadow,rejectShadow,rollback,integrity,addPrivateItem,recordVerifiedRun};
