'use strict';
const {requireStaff}=require('../lib/staff');
const enterprise=require('../lib/enterprise-store');
const integrationConfig=require('../lib/integration-config');
const {tpvState}=require('../lib/external-readiness');
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(s,b)=>({statusCode:s,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(b)});
async function configured(){const cfg=await integrationConfig.tpvsol(),s=tpvState(process.env,cfg);return{managed:cfg.managed,enabled:cfg.enabled,mode:s.mode||'',endpointConfigured:s.endpointConfigured,tokenConfigured:s.tokenConfigured,validated:s.validated,dedicatedVaultKey:s.dedicatedVaultKey}}
async function status(){const cfg=await integrationConfig.tpvsol(),s=tpvState(process.env,cfg),c=await configured();return{provider:'tpvsol',status:s.ready?'VALIDATED':'NOT_VALIDATED',ready:s.ready,checks:c,reason:s.reason,message:s.ready?'Conexión TPVsol declarada como validada; la ejecución debe seguir usando jobs auditados.':'TPVsol permanece bloqueado: falta validar un canal autorizado (API o middleware HTTPS), sus credenciales o la bóveda segura.'}}
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 const auth=await requireStaff(event,event.httpMethod==='POST'?'integrations.manage':'platform.read');if(!auth.ok)return json(auth.statusCode,{error:auth.error});
 if(event.httpMethod==='GET')return json(200,await status());
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 if(body.action!=='queue-sync')return json(400,{error:'Acción no reconocida.'});
 const current=await status();if(!current.ready)return json(409,{error:'TPVsol NO VALIDADO. No se ejecutará ninguna sincronización.',status:current});
 const direction=String(body.direction||'import');if(!['import','export','bidirectional'].includes(direction))return json(400,{error:'Dirección no válida.'});
 try{const job=await enterprise.save('erp-sync-jobs',{provider:'tpvsol',direction,status:'ready',validatedConnection:true,requestedAt:new Date().toISOString(),requestedBy:auth.email},{email:auth.email,role:auth.role},{reason:'tpvsol-sync-request',create:true});return json(202,{job,status:current})}catch(err){return json(500,{error:err.message||'No se pudo crear el trabajo.'})}
};
exports._test={configured,status};
