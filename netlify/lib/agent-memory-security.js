'use strict';

const crypto=require('crypto');
const enterprise=require('./enterprise-store');
const governance=require('./agent-governance');
const safeMemory=require('./agent-safe-memory');

const SYSTEM={email:'agent-memory-security@nutretium.local',role:'system'};
const DOMAINS=Object.freeze({signatures:'agent-checkpoint-signatures',quarantine:'agent-memory-quarantine',peerReviews:'agent-memory-peer-reviews'});
const MIN_HMAC_BYTES=32;
const now=()=>new Date().toISOString();
const safe=v=>String(v||'').trim().toLowerCase();

function keyBuffer(env=process.env){
  const raw=String(env.AGENT_MEMORY_HMAC_KEY||'');
  if(!raw)return null;
  const buf=Buffer.from(raw,'utf8');
  if(buf.length<MIN_HMAC_BYTES)throw new Error('AGENT_MEMORY_HMAC_KEY_TOO_SHORT');
  return buf;
}
function signaturePayload(cp){
  if(!cp?.id||!cp?.agent||!cp?.stateHash)throw new Error('Checkpoint inválido para firma.');
  return safeMemory.stableStringify({id:cp.id,agent:cp.agent,checkpointVersion:cp.checkpointVersion,stateHash:cp.stateHash,profileHash:cp.profileHash,previousCheckpointId:cp.previousCheckpointId||null,verificationStatus:cp.verification?.status||null,createdAt:cp.createdAt||null});
}
function hmac(cp,env=process.env){
  const key=keyBuffer(env);if(!key)return null;
  return crypto.createHmac('sha256',key).update(signaturePayload(cp)).digest('hex');
}
async function signCheckpoint(cp,env=process.env){
  const key=keyBuffer(env);if(!key)return{ok:null,status:'UNCONFIGURED',checkpointId:cp?.id||null};
  const signature=hmac(cp,env),id=String(cp.id),record={id,checkpointId:cp.id,agent:cp.agent,checkpointVersion:cp.checkpointVersion,algorithm:'HMAC-SHA256',signature,payloadHash:crypto.createHash('sha256').update(signaturePayload(cp)).digest('hex'),signedAt:now()};
  const existing=await enterprise.get(DOMAINS.signatures,id).catch(()=>null);
  if(existing){
    if(existing.signature!==signature||existing.payloadHash!==record.payloadHash)throw new Error('AGENT_MEMORY_SIGNATURE_CONFLICT');
    return{ok:true,status:'VALID',existing:true,checkpointId:id,algorithm:record.algorithm};
  }
  await enterprise.save(DOMAINS.signatures,record,SYSTEM,{id,create:true,reason:'agent-checkpoint-sign'});
  return{ok:true,status:'VALID',existing:false,checkpointId:id,algorithm:record.algorithm};
}
async function verifySignature(cp,env=process.env){
  const key=keyBuffer(env);if(!key)return{ok:null,status:'UNCONFIGURED',checkpointId:cp?.id||null};
  const record=await enterprise.get(DOMAINS.signatures,String(cp?.id||'')).catch(()=>null);if(!record)return{ok:false,status:'MISSING',checkpointId:cp?.id||null};
  const expected=hmac(cp,env),a=Buffer.from(String(record.signature||''),'hex'),b=Buffer.from(String(expected||''),'hex');
  const ok=a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);
  return{ok,status:ok?'VALID':'INVALID',checkpointId:cp.id,algorithm:record.algorithm||'HMAC-SHA256',signedAt:record.signedAt||null};
}

async function quarantineStatus(agent){
  const id=safeMemory.canonicalAgent(agent),record=await enterprise.get(DOMAINS.quarantine,id).catch(()=>null);
  return record||{id,agent:id,status:'active',quarantined:false};
}
async function quarantine(agent,reason,{evidence=[],source='guardian'}={}){
  const id=safeMemory.canonicalAgent(agent),current=await quarantineStatus(id);
  if(current.quarantined)return current;
  const record={id,agent:id,status:'quarantined',quarantined:true,reason:String(reason||'integrity_failure').slice(0,500),evidence:Array.isArray(evidence)?evidence.slice(0,30):[],source:String(source||'guardian').slice(0,100),quarantinedAt:now(),releasedAt:null,releasedBy:null};
  return enterprise.save(DOMAINS.quarantine,record,SYSTEM,{id,reason:'agent-memory-quarantine'});
}
async function releaseQuarantine(agent,{actor,reason='owner-release'}={}){
  if(!actor||!['owner','admin'].includes(String(actor.role||'')))throw new Error('QUARANTINE_RELEASE_REQUIRES_OWNER_OR_ADMIN');
  const id=safeMemory.canonicalAgent(agent),current=await quarantineStatus(id);
  if(!current.quarantined)return current;
  const record={...current,status:'active',quarantined:false,releasedAt:now(),releasedBy:String(actor.email||actor.role),releaseReason:String(reason).slice(0,500)};
  return enterprise.save(DOMAINS.quarantine,record,SYSTEM,{id,reason:'agent-memory-quarantine-release'});
}
async function assertNotQuarantined(agent){const q=await quarantineStatus(agent);if(q.quarantined){const e=new Error(`AGENT_QUARANTINED: ${q.reason||'memory-integrity'}`);e.code='AGENT_QUARANTINED';throw e;}return true;}

function reviewerSet(agent){
  const p=governance.profile(agent);if(!p)throw new Error('Agente no reconocido para revisión.');
  const reviewers=new Set(['data_quality','audit']);
  const family=safe(p.family),department=safe(p.department);
  if(['finance','supply'].includes(family)||/finanz|supply|compras/.test(department))reviewers.add('finance');
  if(['quality','product','legal_risk'].includes(family)||/calidad|control|legal|producto/.test(department))reviewers.add('compliance');
  if(['security','technology','data_ai'].includes(family)||/seguridad|tecnolog|datos/.test(department))reviewers.add('security');
  if(['people','executive','strategy','expansion'].includes(family)||/people|direcci|expansi/.test(department))reviewers.add('enterprise_risk');
  reviewers.delete(safe(agent));
  return[...reviewers];
}
function peerChecks(record){
  const result=record?.output?.result||{},gate=result.sourceGate||{},decision=result.decision||{};
  const status=result.status||String(record?.status||'').toUpperCase(),validation=result.validation||'NO_VALIDADO';
  const missing=Array.isArray(gate.missing)?gate.missing:[];
  return{
    fullyCompleted:status==='COMPLETED',
    validated:validation==='VALIDADO',
    noMissingSources:missing.length===0,
    noHumanApproval:Boolean(result.requiresHumanDecision)!==true,
    decisionSafe:!decision.decision||!['HUMAN_APPROVAL_REQUIRED','BLOCKED','REJECTED'].includes(String(decision.decision).toUpperCase()),
    providerSpendSafe:Number(record?.output?.provider?.externalSpendLimitEur||0)===0,
  };
}
async function reviewRun(record){
  if(!record?.id||!record?.agent)throw new Error('Ejecución inválida para peer review.');
  const checks=peerChecks(record),reviewers=reviewerSet(record.agent),approvals=reviewers.map(reviewer=>({reviewer,status:Object.values(checks).every(Boolean)?'APPROVED':'REJECTED',checks})),approved=approvals.every(x=>x.status==='APPROVED');
  const id=String(record.id),review={id,runId:record.id,agent:record.agent,reviewers,approvals,status:approved?'VALIDADO':'NO_VALIDADO',createdAt:now()};
  const existing=await enterprise.get(DOMAINS.peerReviews,id).catch(()=>null);
  if(existing)return existing;
  await enterprise.save(DOMAINS.peerReviews,review,SYSTEM,{id,create:true,reason:'agent-memory-peer-review'});
  return review;
}

module.exports={SYSTEM,DOMAINS,MIN_HMAC_BYTES,keyBuffer,signaturePayload,hmac,signCheckpoint,verifySignature,quarantineStatus,quarantine,releaseQuarantine,assertNotQuarantined,reviewerSet,peerChecks,reviewRun};
