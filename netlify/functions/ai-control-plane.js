'use strict';

const enterprise=require('../lib/enterprise-store');
const governance=require('../lib/agent-governance');
const runtime=require('../lib/ai-runtime');
const ollama=require('../lib/ai-ollama-orchestrator');
const pairing=require('../lib/ollama-pairing');
const memory=require('../lib/ai-memory');
const audit=require('../lib/audit-log');
const {requireStaff}=require('../lib/staff');
const {cabecerasCORS}=require('../lib/cors');
const security=require('../lib/security-policy');

const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,...security.securityHeaders(),'Cache-Control':'no-store'},body:JSON.stringify(body)});
const privileged=auth=>['owner','admin'].includes(String(auth.role||''));

exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 const permission=event.httpMethod==='GET'?'platform.read':'platform.write';
 const auth=await requireStaff(event,permission);if(!auth.ok)return json(auth.statusCode,{error:auth.error});
 try{
  if(event.httpMethod==='GET'){
   const [runs,view,mem,ollamaStatus]=await Promise.all([enterprise.list('ai-runs',{limit:150}).catch(()=>[]),runtime.businessSnapshot(),memory.recent(50),ollama.status().catch(error=>({enabled:false,error:String(error.message||error).slice(0,200),externalSpendLimitEur:0}))]);
   let provider;try{provider=runtime.providerConfig()}catch(error){provider={mode:'invalid',externalSpendLimitEur:0,error:error.message}}
   return json(200,{brain:{name:'Nutretium AI Corporation',status:'operational',externalSpendLimitEur:0,dataQuality:view.dataQuality},departments:governance.departments(),agents:governance.publicRegistry(),provider:{...provider,endpoint:provider.endpoint?'configured':null},ollama:ollamaStatus,business:view,memory:{records:mem.length,validatedFacts:mem.filter(x=>x.type==='fact'&&x.status==='validated').length,operational:mem.filter(x=>x.type==='operational').length,learning:mem.filter(x=>x.type==='learning').length},runs:runs.sort((a,b)=>String(b.startedAt||'').localeCompare(String(a.startedAt||''))).slice(0,100)});
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
  const action=String(body.action||'run');
  if(action==='ollama-pair'){
   if(!privileged(auth))return json(403,{error:'Solo propietario o administrador puede emparejar un runner Ollama.'});
   const pair=await pairing.createPairing({createdBy:auth.email,model:String(body.model||'qwen3:4b').trim()||'qwen3:4b'});
   await audit.append({event,actor:auth.email,action:'OLLAMA_PAIRING_CREATED',resource:'ai-corporation',outcome:'SUCCESS',metadata:{expiresAt:pair.expiresAt,model:pair.model}}).catch(()=>{});
   return json(201,{ok:true,pairing:pair});
  }
  if(action==='ollama-config'){
   if(!privileged(auth))return json(403,{error:'Solo propietario o administrador puede cambiar Ollama.'});
   const cfg=await pairing.writeConfig({enabled:body.enabled!==false,model:String(body.model||'qwen3:4b').trim()||'qwen3:4b'});
   await audit.append({event,actor:auth.email,action:'OLLAMA_CONFIG_UPDATED',resource:'ai-corporation',outcome:'SUCCESS',metadata:{enabled:cfg.enabled,model:cfg.model}}).catch(()=>{});
   return json(200,{ok:true,config:cfg});
  }
  if(action==='portfolio'){
   if(!privileged(auth))return json(403,{error:'La ejecución coordinada completa exige propietario o administrador.'});
   const result=await runtime.savePortfolio({requestedBy:auth.email});
   let generative;try{generative=await ollama.enqueuePortfolio({runs:runtime.PORTFOLIO_RUNS})}catch(error){generative={enabled:true,error:String(error.message||error).slice(0,300),queued:0,reused:0}}
   await audit.append({event,actor:auth.email,action:'AI_CORPORATE_PORTFOLIO_COMPLETED',resource:'ai-corporation',outcome:'SUCCESS',metadata:{agents:result.results.length,failed:result.results.filter(x=>x.status==='failed').length,ollamaQueued:generative.queued||0,externalSpendLimitEur:0}}).catch(()=>{});
   return json(200,{portfolio:result,generative});
  }
  if(action!=='run')return json(400,{error:'Acción no reconocida.'});
  const policy=governance.policy(body.agent,body.agentAction);if(!policy.allowed)return json(400,{error:policy.error});
  if(policy.requiresApproval)return json(409,{error:'La acción requiere aprobación humana y no puede ejecutarse desde el runtime autónomo.',code:'HUMAN_APPROVAL_REQUIRED',policy});
  const record=await runtime.saveRun({agent:policy.agent,action:policy.action,requestedBy:auth.email});
  let generative={enabled:false,created:false,job:null};
  try{const view=await runtime.businessSnapshot();generative=await ollama.enqueueOne({agent:policy.agent,action:policy.action,view,validation:record.output?.result?.validation||'NO_VALIDADO'})}catch(error){generative={enabled:true,created:false,error:String(error.message||error).slice(0,300)}}
  await audit.append({event,actor:auth.email,action:'AI_AUTONOMOUS_RUN_COMPLETED',resource:record.id,outcome:'SUCCESS',metadata:{agent:policy.agent,agentAction:policy.action,provider:record.output?.provider?.mode||'unknown',ollamaJob:generative.job?.id||null,externalSpendLimitEur:0}}).catch(()=>{});
  return json(200,{record,generative});
 }catch(error){console.error('[ai-control-plane]',error);return json(error.statusCode||500,{error:error.message||'No se pudo ejecutar el agente.',runId:error.runId||null})}
};
