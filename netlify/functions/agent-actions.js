'use strict';
const crypto=require('crypto');
const enterprise=require('../lib/enterprise-store');
const {requireStaff}=require('../lib/staff');
const governance=require('../lib/agent-governance');
const audit=require('../lib/audit-log');
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(s,b)=>({statusCode:s,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(b)});
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 const auth=await requireStaff(event,event.httpMethod==='GET'?'platform.read':'platform.write');if(!auth.ok)return json(auth.statusCode,{error:auth.error});
 if(event.httpMethod==='GET'){const records=await enterprise.list('agent-actions',{limit:300}).catch(()=>[]);return json(200,{records,agents:governance.AGENTS});}
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 const action=String(body.action||'propose');
 try{
  if(action==='propose'){
   const p=governance.policy(body.agent,body.agentAction);if(!p.allowed)return json(400,{error:p.error});
   const id=crypto.randomUUID(),record=await enterprise.save('agent-actions',{agent:p.agent,action:p.action,scope:String(body.scope||p.scopes[0]||'platform.read'),sensitive:p.sensitive,status:'proposed',reason:String(body.reason||'').slice(0,1000),payload:body.payload&&typeof body.payload==='object'?body.payload:{},proposedBy:auth.email,proposedAt:new Date().toISOString()},{email:auth.email,role:auth.role},{id,reason:'agent-action-proposal',create:true});
   await audit.append({event,actor:auth.email,action:'AGENT_ACTION_PROPOSED',resource:id,outcome:'SUCCESS',metadata:{agent:p.agent,agentAction:p.action,sensitive:p.sensitive}}).catch(()=>{});return json(201,{record});
  }
  const id=String(body.id||'');if(!id)return json(400,{error:'Falta id.'});const current=await enterprise.get('agent-actions',id);if(!current)return json(404,{error:'Propuesta no encontrada.'});
  if(action==='approve'){
   if(current.status!=='proposed')return json(409,{error:'Solo se pueden aprobar propuestas pendientes.'});if(!governance.canApprove(current,auth))return json(403,{error:'La aprobación exige owner/admin distinto del proponente.'});
   const record=await enterprise.save('agent-actions',{...current,status:'approved',approvedBy:auth.email,approvedAt:new Date().toISOString()},{email:auth.email,role:auth.role},{id,reason:'agent-action-approved'});await audit.append({event,actor:auth.email,action:'AGENT_ACTION_APPROVED',resource:id,outcome:'SUCCESS'}).catch(()=>{});return json(200,{record});
  }
  if(action==='reject'){
   if(!['proposed','approved'].includes(current.status))return json(409,{error:'La acción ya no admite rechazo.'});if(!['owner','admin'].includes(auth.role))return json(403,{error:'Solo owner/admin puede rechazar una acción de agente.'});const record=await enterprise.save('agent-actions',{...current,status:'rejected',rejectedBy:auth.email,rejectedAt:new Date().toISOString(),rejectionReason:String(body.reason||'').slice(0,1000)},{email:auth.email,role:auth.role},{id,reason:'agent-action-rejected'});return json(200,{record});
  }
  if(action==='mark-executed'){
   if(current.status!=='approved'||!current.approvedBy)return json(409,{error:'No puede marcarse ejecutada sin aprobación previa.'});if(!['owner','admin'].includes(auth.role))return json(403,{error:'Solo owner/admin puede confirmar ejecución.'});const record=await enterprise.save('agent-actions',{...current,status:'executed',executedBy:auth.email,executedAt:new Date().toISOString(),executionReference:String(body.executionReference||'').slice(0,240)},{email:auth.email,role:auth.role},{id,reason:'agent-action-executed'});return json(200,{record});
  }
  return json(400,{error:'Acción no reconocida.'});
 }catch(err){return json(err.statusCode||500,{error:err.message||'No se pudo gestionar la acción del agente.'})}
};
