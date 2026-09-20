'use strict';

const enterprise=require('./enterprise-store');
const governance=require('./agent-governance');

const SYSTEM={email:'ai-control-plane@nutretium.local',role:'system'};
const MAX_ROWS=500;
const safeList=async collection=>enterprise.list(collection,{limit:MAX_ROWS}).catch(()=>[]);
const n=v=>Number.isFinite(Number(v))?Number(v):0;

function providerConfig(env=process.env){
 const spend=Number(env.AI_EXTERNAL_SPEND_LIMIT_EUR||0);
 if(!Number.isFinite(spend)||spend!==0)throw new Error('AI_EXTERNAL_SPEND_LIMIT_EUR debe permanecer en 0 para el modo gratuito.');
 const mode=String(env.AI_PROVIDER||'deterministic').trim().toLowerCase();
 if(!['deterministic','ollama_gateway'].includes(mode))throw new Error('Proveedor IA no permitido.');
 const endpoint=String(env.AI_OLLAMA_GATEWAY_URL||'').trim().replace(/\/$/,'');
 if(mode==='ollama_gateway'&&(!endpoint.startsWith('https://')||!env.AI_OLLAMA_GATEWAY_TOKEN))throw new Error('Ollama Gateway requiere HTTPS y token privado.');
 return{mode,externalSpendLimitEur:0,endpoint:mode==='ollama_gateway'?endpoint:null,model:String(env.AI_OLLAMA_MODEL||'').trim()||null};
}

function summarizeInventory(rows){
 const low=rows.filter(x=>Number.isFinite(Number(x.reorderPoint))&&(n(x.onHand)-n(x.reserved))<=n(x.reorderPoint));
 const negative=rows.filter(x=>(n(x.onHand)-n(x.reserved))<0);
 return{records:rows.length,lowStock:low.length,negativeAvailable:negative.length,examples:low.slice(0,10).map(x=>({id:x.id||null,sku:x.sku||null,available:n(x.onHand)-n(x.reserved),reorderPoint:n(x.reorderPoint),reorderQty:n(x.reorderQty) }))};
}
function summarizeOrders(rows){
 const byStatus={};let gross=0;
 for(const x of rows){const s=String(x.status||'unknown');byStatus[s]=(byStatus[s]||0)+1;gross+=n(x.total||x.amount||0)}
 return{records:rows.length,byStatus,grossRecorded:gross};
}
function summarizeCatalog(rows){
 const inactive=rows.filter(x=>x.active===false||x.status==='inactive');
 const missingPrice=rows.filter(x=>!Number.isFinite(Number(x.price))&&x.price!==0);
 return{records:rows.length,inactive:inactive.length,missingPrice:missingPrice.length};
}
function summarizeCompliance(rows){
 const blocked=rows.filter(x=>x.status==='blocked'||x.approved===false);
 const pending=rows.filter(x=>['pending','review','not_validated'].includes(String(x.status||'').toLowerCase()));
 return{records:rows.length,blocked:blocked.length,pending:pending.length};
}

async function businessSnapshot(){
 const[inventory,orders,catalog,compliance,incidents]=await Promise.all([
  safeList('inventory'),safeList('orders'),safeList('products'),safeList('compliance-records'),safeList('incidents')
 ]);
 return{
  generatedAt:new Date().toISOString(),
  inventory:summarizeInventory(inventory),
  orders:summarizeOrders(orders),
  catalog:summarizeCatalog(catalog),
  compliance:summarizeCompliance(compliance),
  incidents:{records:incidents.length,open:incidents.filter(x=>!['closed','resolved'].includes(String(x.status||'').toLowerCase())).length},
 };
}

function deterministicResult(agent,action,snapshot){
 const base={agent,action,mode:'deterministic',generatedAt:new Date().toISOString(),facts:snapshot,recommendations:[],requiresHumanDecision:false};
 if(agent==='inventory')base.recommendations.push(snapshot.inventory.lowStock?`Revisar ${snapshot.inventory.lowStock} referencias en punto de reposición o por debajo.`:'No se detectan referencias bajo el punto de reposición en los datos disponibles.');
 if(agent==='purchasing')base.recommendations.push(snapshot.inventory.lowStock?'Preparar borrador de reposición usando reorderQty; no enviar pedidos automáticamente.':'No generar pedido sin necesidad de reposición documentada.');
 if(agent==='sales')base.recommendations.push('Usar pedidos registrados para revisar distribución por estado y facturación registrada; no inferir demanda sin serie temporal suficiente.');
 if(agent==='marketing')base.recommendations.push('Crear únicamente borradores; publicación, descuentos y mensajes a clientes requieren aprobación.');
 if(agent==='ecommerce')base.recommendations.push(snapshot.catalog.missingPrice?`Revisar ${snapshot.catalog.missingPrice} productos sin precio numérico validado.`:'No se detectan productos sin precio numérico en la muestra.');
 if(agent==='compliance')base.recommendations.push(snapshot.compliance.pending?`Mantener bloqueados ${snapshot.compliance.pending} expedientes pendientes de validación.`:'No aprobar productos basándose únicamente en este resumen.');
 if(agent==='security')base.recommendations.push(snapshot.incidents.open?`Revisar ${snapshot.incidents.open} incidencias abiertas.`:'No hay incidencias abiertas en la colección consultada.');
 if(agent==='finance')base.recommendations.push('El total mostrado es el importe registrado en pedidos, no beneficio ni caja conciliada.');
 if(agent==='director')base.recommendations.push('Priorizar stock crítico, incidencias abiertas y expedientes de cumplimiento pendientes antes de automatizaciones comerciales.');
 if(!base.recommendations.length)base.recommendations.push('Análisis disponible; cualquier acción con efecto externo debe pasar por la política de gobierno correspondiente.');
 return base;
}

async function ollamaGateway(agent,action,snapshot,env=process.env){
 const cfg=providerConfig(env);
 const policy=governance.policy(agent,action);if(!policy.allowed)throw new Error(policy.error);
 const response=await fetch(`${cfg.endpoint}/api/chat`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${env.AI_OLLAMA_GATEWAY_TOKEN}`},body:JSON.stringify({model:cfg.model||undefined,stream:false,messages:[{role:'system',content:'Eres un agente interno de Nutretium. No inventes datos. Distingue hechos, inferencias, estimaciones y recomendaciones. No autorices pagos, compras, cambios de permisos, seguridad, cumplimiento ni despliegues.'},{role:'user',content:JSON.stringify({agent,action,snapshot})}]})});
 if(!response.ok)throw new Error(`Ollama Gateway respondió ${response.status}.`);
 const data=await response.json();
 return{agent,action,mode:'ollama_gateway',generatedAt:new Date().toISOString(),facts:snapshot,model:cfg.model||data.model||null,text:String(data?.message?.content||'').slice(0,20000),requiresHumanDecision:policy.requiresApproval};
}

async function run(agent,action,env=process.env){
 const p=governance.policy(agent,action);if(!p.allowed)throw new Error(p.error);
 const cfg=providerConfig(env),snapshot=await businessSnapshot();
 const result=cfg.mode==='ollama_gateway'?await ollamaGateway(p.agent,p.action,snapshot,env):deterministicResult(p.agent,p.action,snapshot);
 return{policy:p,provider:{mode:cfg.mode,externalSpendLimitEur:0,model:cfg.model},result};
}

async function saveRun({agent,action,requestedBy='system',env=process.env}){
 const id=require('crypto').randomUUID(),startedAt=new Date().toISOString();
 await enterprise.save('ai-runs',{id,agent,action,status:'running',requestedBy,startedAt},SYSTEM,{id,create:true,reason:'ai-run-start'});
 try{const output=await run(agent,action,env);const record={id,agent,action,status:'completed',requestedBy,startedAt,completedAt:new Date().toISOString(),output};await enterprise.save('ai-runs',record,SYSTEM,{id,reason:'ai-run-complete'});return record}catch(error){const record={id,agent,action,status:'failed',requestedBy,startedAt,failedAt:new Date().toISOString(),error:String(error.message||error).slice(0,1000)};await enterprise.save('ai-runs',record,SYSTEM,{id,reason:'ai-run-failed'}).catch(()=>{});throw Object.assign(error,{runId:id});}
}

module.exports={providerConfig,businessSnapshot,deterministicResult,run,saveRun,SYSTEM};
