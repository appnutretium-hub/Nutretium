'use strict';

const safeMemory=require('../lib/agent-safe-memory');
const backup=require('../lib/agent-checkpoint-backup');
const {requireStaff}=require('../lib/staff');
const {cabecerasCORS}=require('../lib/cors');
const security=require('../lib/security-policy');
const audit=require('../lib/audit-log');

const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,...security.securityHeaders(),'Cache-Control':'no-store'},body:JSON.stringify(body)});
const privileged=auth=>['owner','admin'].includes(String(auth.role||''));

exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  const auth=await requireStaff(event,event.httpMethod==='GET'?'platform.read':'platform.write');if(!auth.ok)return json(auth.statusCode,{error:auth.error});
  try{
    const query=event.queryStringParameters||{};
    if(event.httpMethod==='GET'){
      const agent=String(query.agent||'');if(!agent)return json(400,{error:'Falta agent.'});
      const current=await safeMemory.currentCheckpoint(agent),integrity=await safeMemory.integrity(agent,{depth:Number(query.depth)||5}),backupIntegrity=await backup.verifyBackup(agent).catch(error=>({ok:false,error:String(error.message||error)}));
      return json(200,{agent:safeMemory.canonicalAgent(agent),current:current?{id:current.id,checkpointVersion:current.checkpointVersion,stateHash:current.stateHash,profileHash:current.profileHash,previousCheckpointId:current.previousCheckpointId,createdAt:current.createdAt,verification:current.verification}:null,integrity,backup:backupIntegrity});
    }
    if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
    if(!privileged(auth))return json(403,{error:'La recuperación de memoria exige propietario o administrador.'});
    let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
    const mode=String(body.mode||'integrity').toLowerCase(),agent=String(body.agent||'');if(!agent)return json(400,{error:'Falta agent.'});
    if(mode==='integrity')return json(200,{integrity:await safeMemory.integrity(agent,{depth:Number(body.depth)||10}),backup:await backup.verifyBackup(agent).catch(error=>({ok:false,error:String(error.message||error)}))});
    if(mode==='rollback'){
      if(!body.checkpointId)return json(400,{error:'Falta checkpointId.'});
      const restored=await safeMemory.rollback(agent,String(body.checkpointId),{actor:auth});
      const mirror=await backup.mirrorChain(agent,{depth:5});
      await audit.append({event,actor:auth.email,action:'AGENT_MEMORY_ROLLBACK',resource:restored.id,outcome:'SUCCESS',metadata:{agent:safeMemory.canonicalAgent(agent),targetCheckpointId:String(body.checkpointId),checkpointVersion:restored.checkpointVersion,mirror}}).catch(()=>{});
      return json(200,{restored:{id:restored.id,agent:restored.agent,checkpointVersion:restored.checkpointVersion,stateHash:restored.stateHash,rollbackToCheckpointId:restored.rollbackToCheckpointId},backup:await backup.verifyBackup(agent)});
    }
    return json(400,{error:'Modo no reconocido.'});
  }catch(error){console.error('[agent-memory-status]',error);return json(500,{error:error.message||'No se pudo consultar la memoria segura.'});}
};
