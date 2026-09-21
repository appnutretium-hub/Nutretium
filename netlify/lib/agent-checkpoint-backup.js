'use strict';

const {getBlobStore}=require('./blob-store');
const safeMemory=require('./agent-safe-memory');

const STORE='agent-checkpoint-backup-v1';
const safe=v=>String(v||'').replace(/[^a-zA-Z0-9._:-]/g,'-').slice(0,160);
const storeOrThrow=()=>{const s=getBlobStore(STORE);if(!s)throw new Error('AGENT_BACKUP_STORE_UNAVAILABLE');return s;};
const keyFor=cp=>`checkpoint/${safe(cp.agent)}/${String(cp.checkpointVersion||0).padStart(8,'0')}/${safe(cp.id)}`;

async function mirrorCheckpoint(cp){
  if(!cp?.id||!cp?.agent||!cp?.stateHash)throw new Error('Checkpoint inválido para backup.');
  const computed=safeMemory.hash(cp.state);if(computed!==cp.stateHash)throw new Error('AGENT_BACKUP_SOURCE_HASH_MISMATCH');
  const payload={id:cp.id,agent:cp.agent,checkpointVersion:cp.checkpointVersion,state:cp.state,stateHash:cp.stateHash,profileHash:cp.profileHash,previousCheckpointId:cp.previousCheckpointId||null,verification:cp.verification||null,createdAt:cp.createdAt||null,mirroredAt:new Date().toISOString()};
  const result=await storeOrThrow().setJSON(keyFor(cp),payload,{onlyIfNew:true});
  if(result&&result.modified===false){
    const existing=await storeOrThrow().get(keyFor(cp),{type:'json',consistency:'strong'}).catch(()=>null);
    if(!existing||existing.stateHash!==cp.stateHash)throw new Error('AGENT_BACKUP_IMMUTABILITY_CONFLICT');
    return{mirrored:false,existing:true,key:keyFor(cp),stateHash:cp.stateHash};
  }
  return{mirrored:true,existing:false,key:keyFor(cp),stateHash:cp.stateHash};
}

async function mirrorChain(agent,{depth=5}={}){
  let cp=await safeMemory.currentCheckpoint(agent),count=0;const results=[];
  while(cp&&count<Math.max(1,Math.min(Number(depth)||5,20))){
    results.push(await mirrorCheckpoint(cp));
    if(!cp.previousCheckpointId)break;
    cp=await safeMemory.checkpoint(cp.previousCheckpointId);count++;
  }
  return{agent:safeMemory.canonicalAgent(agent),store:STORE,mirrored:results.length,results};
}

async function readBackup({agent,checkpointVersion,id}={}){
  const a=safeMemory.canonicalAgent(agent),s=storeOrThrow();
  if(id&&checkpointVersion){const key=`checkpoint/${safe(a)}/${String(Number(checkpointVersion)||0).padStart(8,'0')}/${safe(id)}`;return s.get(key,{type:'json',consistency:'strong'}).catch(()=>null);}
  const page=await s.list();const prefix=`checkpoint/${safe(a)}/`,keys=(page.blobs||[]).map(x=>x.key).filter(k=>k.startsWith(prefix)).sort().reverse();
  if(!keys.length)return null;return s.get(keys[0],{type:'json',consistency:'strong'}).catch(()=>null);
}

async function verifyBackup(agent){
  const backup=await readBackup({agent});if(!backup)return{ok:false,error:'NO_BACKUP',agent:safeMemory.canonicalAgent(agent)};
  const computed=safeMemory.hash(backup.state);return{ok:computed===backup.stateHash,agent:backup.agent,checkpointId:backup.id,checkpointVersion:backup.checkpointVersion,stateHash:backup.stateHash,computedHash:computed,mirroredAt:backup.mirroredAt};
}

module.exports={STORE,keyFor,mirrorCheckpoint,mirrorChain,readBackup,verifyBackup};
