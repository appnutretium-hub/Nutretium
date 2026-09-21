'use strict';

const safeMemory=require('../lib/agent-safe-memory');
const backup=require('../lib/agent-checkpoint-backup');
const memorySecurity=require('../lib/agent-memory-security');
const lifecycle=require('../lib/agent-memory-lifecycle');
const {requireStaff}=require('../lib/staff');
const {cabecerasCORS}=require('../lib/cors');
const headersSecurity=require('../lib/security-policy');
const audit=require('../lib/audit-log');

const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,...headersSecurity.securityHeaders(),'Cache-Control':'no-store'},body:JSON.stringify(body)});
const privileged=auth=>['owner','admin'].includes(String(auth.role||''));
const signingEnv=()=>({...process.env,AGENT_MEMORY_HMAC_KEY:process.env.AGENT_MEMORY_HMAC_KEY||process.env.JWT_SECRET||''});

async function health(agent,depth=5){
  const current=await safeMemory.currentCheckpoint(agent),integrity=await safeMemory.integrity(agent,{depth}),backupIntegrity=await backup.verifyBackup(agent).catch(error=>({ok:false,error:String(error.message||error)})),quarantine=await memorySecurity.quarantineStatus(agent);
  const signature=current?await memorySecurity.verifySignature(current,signingEnv()).catch(error=>({ok:false,status:'ERROR',error:String(error.message||error)})):{ok:null,status:'NO_CHECKPOINT'};
  return{agent:safeMemory.canonicalAgent(agent),current:current?{id:current.id,checkpointVersion:current.checkpointVersion,stateHash:current.stateHash,profileHash:current.profileHash,previousCheckpointId:current.previousCheckpointId,createdAt:current.createdAt,verification:current.verification}:null,integrity,backup:backupIntegrity,signature,quarantine};
}

exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  const auth=await requireStaff(event,event.httpMethod==='GET'?'platform.read':'platform.write');if(!auth.ok)return json(auth.statusCode,{error:auth.error});
  try{
    const query=event.queryStringParameters||{};
    if(event.httpMethod==='GET'){
      const agent=String(query.agent||'');if(!agent)return json(400,{error:'Falta agent.'});
      return json(200,await health(agent,Number(query.depth)||5));
    }
    if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
    if(!privileged(auth))return json(403,{error:'La gestión de memoria exige propietario o administrador.'});
    let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
    const mode=String(body.mode||'integrity').toLowerCase(),agent=String(body.agent||'');if(!agent)return json(400,{error:'Falta agent.'});
    if(mode==='integrity')return json(200,await health(agent,Number(body.depth)||10));
    if(mode==='drill')return json(200,{drill:await lifecycle.recoveryDrill(agent),health:await health(agent,5)});
    if(mode==='compact'){
      const result=await lifecycle.compactAgent(agent,{requestedBy:auth.email,keepPerBucket:Number(body.keepPerBucket)||16});
      await audit.append({event,actor:auth.email,action:'AGENT_MEMORY_COMPACT',resource:safeMemory.canonicalAgent(agent),outcome:result.ok?'SUCCESS':'FAILURE',metadata:{status:result.status,checkpointVersion:result.checkpointVersion||null}}).catch(()=>{});
      return json(result.ok?200:409,{result,health:await health(agent,5)});
    }
    if(mode==='release_quarantine'){
      const released=await memorySecurity.releaseQuarantine(agent,{actor:auth,reason:String(body.reason||'owner-release')});
      await audit.append({event,actor:auth.email,action:'AGENT_MEMORY_QUARANTINE_RELEASE',resource:safeMemory.canonicalAgent(agent),outcome:'SUCCESS',metadata:{reason:released.releaseReason||null}}).catch(()=>{});
      return json(200,{released,health:await health(agent,5)});
    }
    if(mode==='rollback'){
      if(!body.checkpointId)return json(400,{error:'Falta checkpointId.'});
      const restored=await safeMemory.rollback(agent,String(body.checkpointId),{actor:auth});
      const signed=await memorySecurity.signCheckpoint(restored,signingEnv()),mirror=await backup.mirrorChain(agent,{depth:5});
      await audit.append({event,actor:auth.email,action:'AGENT_MEMORY_ROLLBACK',resource:restored.id,outcome:'SUCCESS',metadata:{agent:safeMemory.canonicalAgent(agent),targetCheckpointId:String(body.checkpointId),checkpointVersion:restored.checkpointVersion,mirror,signature:signed.status}}).catch(()=>{});
      return json(200,{restored:{id:restored.id,agent:restored.agent,checkpointVersion:restored.checkpointVersion,stateHash:restored.stateHash,rollbackToCheckpointId:restored.rollbackToCheckpointId},signature:signed,backup:await backup.verifyBackup(agent),health:await health(agent,5)});
    }
    return json(400,{error:'Modo no reconocido.'});
  }catch(error){console.error('[agent-memory-status]',error);const code=error.code==='AGENT_QUARANTINED'?423:500;return json(code,{error:error.message||'No se pudo consultar la memoria segura.',code:error.code||null});}
};
