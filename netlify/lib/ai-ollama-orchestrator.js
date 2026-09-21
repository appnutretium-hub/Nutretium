'use strict';

const crypto=require('crypto');
const runtime=require('./ai-runtime');
const queue=require('./ollama-queue');
const pairing=require('./ollama-pairing');

const SYSTEM_PROMPT='Eres un empleado IA interno de Nutretium. Usa exclusivamente los datos resumidos suministrados. Prohibido inventar datos, inferir datos personales sensibles o convertir ausencia de datos en hechos. Separa DATO VERIFICADO, INFERENCIA, ESTIMACION y RECOMENDACION. Si una fuente necesaria no está validada, indica NO VALIDADO. No autorices pagos, compras, cambios de precio, mensajes a clientes, cambios de permisos, seguridad, cumplimiento, contratos, decisiones laborales ni despliegues. Esas acciones requieren los controles humanos y de veto de Nutretium.';

async function config(env=process.env){
 const persisted=await pairing.readConfig().catch(()=>({enabled:false,model:'qwen3:4b'}));
 const envEnabled=String(env.AI_OLLAMA_QUEUE_ENABLED||'').toLowerCase();
 const enabled=envEnabled?envEnabled==='true':Boolean(persisted.enabled);
 const model=String(env.AI_OLLAMA_MODEL||persisted.model||'qwen3:4b').trim();
 if(enabled&&!model)throw new Error('AI_OLLAMA_MODEL es obligatorio cuando la cola Ollama está activa.');
 return{enabled,model:model||null,externalSpendLimitEur:0,transport:'outbound_runner'};
}
function fingerprint(view){
 const stable={sources:view?.sources||{},inventory:view?.inventory||{},orders:view?.orders||{},catalog:view?.catalog||{},compliance:view?.compliance||{},suppliers:view?.suppliers||{},purchasing:view?.purchasing||{},logistics:view?.logistics||{},finance:view?.finance||{},customer:view?.customer||{},digital:view?.digital||{},operations:view?.operations||{}};
 return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0,24);
}
function messages(agent,action,view,requiredSources=[]){
 const payload={agent,action,requiredSources,businessView:view};
 return[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(payload)}];
}
async function enqueueOne({agent,action,view,validation='NO_VALIDADO',env=process.env}){
 const cfg=await config(env);if(!cfg.enabled)return{enabled:false,created:false,job:null};
 const required=runtime.REQUIRED_SOURCES[agent]||[],dedupeKey=`${fingerprint(view)}:${agent}:${action}:${cfg.model}`;
 const result=await queue.enqueue({agent,action,messages:messages(agent,action,view,required),model:cfg.model,validation,requiredSources:required,dedupeKey});
 return{enabled:true,created:result.created,job:{id:result.job.id,status:result.job.status,agent:result.job.agent,action:result.job.action,model:result.job.model}};
}
async function enqueuePortfolio({runs=runtime.PORTFOLIO_RUNS,env=process.env}={}){
 const cfg=await config(env);if(!cfg.enabled)return{enabled:false,queued:0,reused:0,jobs:[]};
 const view=await runtime.businessSnapshot(),jobs=[];let queued=0,reused=0;
 for(const [agent,action] of runs){
  const sourceGate={missing:(runtime.REQUIRED_SOURCES[agent]||[]).filter(k=>!view.sources?.[k]||view.sources[k].status==='NO_VALIDADO')};
  const out=await enqueueOne({agent,action,view,validation:sourceGate.missing.length?'NO_VALIDADO':'VALIDADO',env});
  jobs.push(out.job);if(out.created)queued++;else reused++;
 }
 return{enabled:true,queued,reused,model:cfg.model,externalSpendLimitEur:0,jobs};
}
async function status(env=process.env){
 const cfg=await config(env),pairingStatus=await pairing.status().catch(()=>({runners:[]}));
 if(!cfg.enabled)return{...cfg,runnerCount:(pairingStatus.runners||[]).filter(x=>!x.revoked).length,runners:pairingStatus.runners||[],queue:{pending:0,processing:0,completed:0,failed:0,total:0,lastCompletedAt:null,lastModel:null}};
 return{...cfg,runnerCount:(pairingStatus.runners||[]).filter(x=>!x.revoked).length,runners:pairingStatus.runners||[],queue:await queue.stats()};
}
module.exports={SYSTEM_PROMPT,config,fingerprint,messages,enqueueOne,enqueuePortfolio,status};
