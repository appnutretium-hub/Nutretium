'use strict';

const crypto=require('crypto');
const enterprise=require('./enterprise-store');
const governance=require('./agent-governance');
const truth=require('./ai-truth-layer');
const decisions=require('./ai-decision-engine');
const memory=require('./ai-memory');

const SYSTEM={email:'ai-control-plane@nutretium.local',role:'system'};
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const lc=v=>String(v||'').trim().toLowerCase();

const REQUIRED_SOURCES=Object.freeze({
 executive_brain:['orders','inventory','products'], strategy:['orders','products'], audit:[], data_quality:[],
 sales:['orders','products'], forecasting:['orders','inventory'], inventory:['inventory'], purchasing:['inventory','orders'],
 suppliers:['suppliers'], logistics:['shipments','orders'], operations:[], product_innovation:['orders','products'],
 category_management:['orders','products'], pricing:['products','productCosts'], finance:['orders'], procurement_control:['purchaseOrders'],
 marketing:['orders','analytics'], growth:['orders','analytics'], crm:['orders'], ecommerce:['products'], seo:['products'],
 marketplace:['products'], customer_service:['orders'], customer_experience:['reviews'], compliance:['productCompliance'], legal:[],
 enterprise_risk:[], security:[], development:[], sre:[], data_analytics:['orders'], hr:[], training:[], sustainability:[], franchise:['orders']
});

const PORTFOLIO_RUNS=Object.freeze([
 ['data_quality','quality-scan'],['audit','evidence-audit'],['executive_brain','executive-brief'],['strategy','strategy-scan'],
 ['sales','sales-brief'],['forecasting','demand-forecast'],['inventory','low-stock-scan'],['purchasing','purchase-plan'],
 ['suppliers','supplier-scorecard'],['logistics','delay-scan'],['operations','health-scan'],['product_innovation','product-opportunity-scan'],
 ['category_management','category-performance'],['pricing','margin-scan'],['finance','financial-brief'],['procurement_control','purchase-budget-check'],
 ['marketing','channel-performance-scan'],['growth','funnel-scan'],['crm','retention-scan'],['ecommerce','catalog-audit'],['seo','seo-audit'],
 ['marketplace','marketplace-gap-scan'],['customer_service','case-triage'],['customer_experience','review-insight-scan'],
 ['compliance','documentation-gap-scan'],['legal','legal-gap-scan'],['enterprise_risk','risk-register-scan'],['security','audit-scan'],
 ['development','architecture-scan'],['sre','reliability-scan'],['data_analytics','kpi-brief'],['hr','workload-scan'],
 ['training','sop-gap-scan'],['sustainability','waste-scan'],['franchise','franchise-readiness-scan']
]);

function providerConfig(env=process.env){
 const spend=Number(env.AI_EXTERNAL_SPEND_LIMIT_EUR||0);
 if(!Number.isFinite(spend)||spend!==0)throw new Error('AI_EXTERNAL_SPEND_LIMIT_EUR debe permanecer en 0 para el modo gratuito.');
 const mode=String(env.AI_PROVIDER||'deterministic').trim().toLowerCase();
 if(!['deterministic','ollama_gateway'].includes(mode))throw new Error('Proveedor IA no permitido.');
 const endpoint=String(env.AI_OLLAMA_GATEWAY_URL||'').trim().replace(/\/$/,'');
 if(mode==='ollama_gateway'&&(!endpoint.startsWith('https://')||!env.AI_OLLAMA_GATEWAY_TOKEN))throw new Error('Ollama Gateway requiere HTTPS y token privado.');
 return{mode,externalSpendLimitEur:0,endpoint:mode==='ollama_gateway'?endpoint:null,model:String(env.AI_OLLAMA_MODEL||'').trim()||null};
}

function summarizeInventory(rows=[]){
 const low=rows.filter(x=>Number.isFinite(Number(x.reorderPoint))&&(n(x.onHand)-n(x.reserved))<=n(x.reorderPoint));
 const negative=rows.filter(x=>(n(x.onHand)-n(x.reserved))<0),dead=rows.filter(x=>n(x.onHand)>0&&lc(x.status)==='dead_stock');
 return{records:rows.length,lowStock:low.length,negativeAvailable:negative.length,deadStock:dead.length,examples:low.slice(0,10).map(x=>({id:x.id||null,sku:x.sku||null,available:n(x.onHand)-n(x.reserved),reorderPoint:n(x.reorderPoint),reorderQty:n(x.reorderQty)}))};
}
function summarizeOrders(rows=[]){
 const byStatus={};let gross=0;const dated=[];
 for(const x of rows){const s=lc(x.status)||'unknown';byStatus[s]=(byStatus[s]||0)+1;gross+=n(x.totalCents??x.total??x.amountCents??x.amount);const d=Date.parse(x.createdAt||x.updatedAt||0);if(Number.isFinite(d))dated.push(d)}
 return{records:rows.length,byStatus,grossRecorded:gross,datedRecords:dated.length,oldestAt:dated.length?new Date(Math.min(...dated)).toISOString():null,newestAt:dated.length?new Date(Math.max(...dated)).toISOString():null};
}
function summarizeCatalog(rows=[]){return{records:rows.length,inactive:rows.filter(x=>x.active===false||lc(x.status)==='inactive').length,missingPrice:rows.filter(x=>!Number.isFinite(Number(x.priceCents??x.price))&&(x.priceCents??x.price)!==0).length}}
function summarizeCompliance(rows=[]){return{records:rows.length,blocked:rows.filter(x=>lc(x.status)==='blocked'||x.approved===false).length,pending:rows.filter(x=>['pending','review','under_review','not_validated','draft'].includes(lc(x.status))).length}}
function summarizeSuppliers(rows=[]){return{records:rows.length,active:rows.filter(x=>!x.status||['active','approved','validated'].includes(lc(x.status))).length,blocked:rows.filter(x=>['blocked','rejected','suspended'].includes(lc(x.status))).length}}
function summarizeGeneric(rows=[]){const open=rows.filter(x=>!['closed','resolved','completed','cancelled','rejected'].includes(lc(x.status)));return{records:rows.length,attention:open.length}}

function businessView(snapshot){
 const d=snapshot.data||{};
 return{
  generatedAt:snapshot.generatedAt,
  dataQuality:snapshot.quality,
  sources:snapshot.sources,
  inventory:summarizeInventory(d.inventory),orders:summarizeOrders(d.orders),catalog:summarizeCatalog(d.products),
  compliance:summarizeCompliance([...(d.compliance||[]),...(d.productCompliance||[])]),suppliers:summarizeSuppliers(d.suppliers),
  purchasing:summarizeGeneric(d.purchaseOrders),logistics:summarizeGeneric(d.shipments),returns:summarizeGeneric(d.returns),
  finance:{reconciliation:summarizeGeneric(d.reconciliation),invoices:summarizeGeneric(d.invoices)},
  customer:{reviews:summarizeGeneric(d.reviews),tickets:summarizeGeneric(d.crmTickets)},
  digital:{analyticsRecords:(d.analytics||[]).length,marketplace:summarizeGeneric(d.marketplace)},
  operations:{incidents:summarizeGeneric([...(d.incidents||[]),...(d.systemIncidents||[])]),integrations:summarizeGeneric(d.integrations),automations:summarizeGeneric(d.automationRules)}
 };
}
async function businessSnapshot(){const s=await truth.snapshot();return businessView(s)}

function noteFor(agent,view,gate){
 const q=view.dataQuality||{};
 if(!gate.ok)return `NO VALIDADO: faltan fuentes fiables (${gate.missing.join(', ')}). El agente puede señalar carencias, pero no convertirlas en hechos ni decisiones.`;
 const map={
  executive_brain:'Coordinar prioridades entre crecimiento, stock, riesgo, cumplimiento y caja sin ejecutar acciones críticas.',
  strategy:'Preparar escenarios de crecimiento; no aprobar inversión ni entrada en mercados.',audit:'Buscar afirmaciones sin evidencia y decisiones que no puedan trazarse.',
  data_quality:`Cobertura de fuentes utilizables: ${q.coveragePct??0}%. Priorizar fuentes ausentes o obsoletas.`,sales:`Pedidos registrados: ${view.orders.records}; revisar tendencias solo donde exista serie temporal.`,
  forecasting:'Generar previsión únicamente sobre series con fechas suficientes; marcar el resto NO VALIDADO.',inventory:`Referencias en reposición o por debajo: ${view.inventory.lowStock}.`,
  purchasing:'Preparar borradores de compra contrastando demanda, stock, cobertura y proveedor; nunca enviar pedidos automáticamente.',suppliers:`Proveedores registrados: ${view.suppliers.records}; evaluar precio, calidad, lead time, incidencias y cumplimiento cuando existan datos.`,
  logistics:`Envíos registrados: ${view.logistics.records}; priorizar excepciones verificadas.`,operations:`Incidencias registradas: ${view.operations.incidents.records}.`,
  product_innovation:'Buscar oportunidades respaldadas por ventas internas y evidencia externa validada; no confundir tendencias con demanda confirmada.',category_management:`Productos registrados: ${view.catalog.records}; optimizar surtido con ventas, margen, stock y rotación.`,
  pricing:'Separar precio, coste y margen; si falta coste puesto, marcar margen NO VALIDADO.',finance:'No equiparar importe de pedidos con caja, beneficio ni conciliación bancaria.',
  procurement_control:'Contrastar cada propuesta de compra con presupuesto y necesidad antes de aprobación.',marketing:'Crear hipótesis y borradores medibles; publicación y descuentos requieren aprobación.',
  growth:'Priorizar experimentos con métrica, baseline y criterio de éxito.',crm:'Segmentar solo sobre datos consentidos y disponibles; no inferir atributos sensibles.',ecommerce:`Auditar catálogo; productos sin precio numérico: ${view.catalog.missingPrice}.`,
  seo:'Crear borradores basados en catálogo y demanda de búsqueda validada cuando exista.',marketplace:'Evaluar canales sin publicar listados ni activar integraciones.',
  customer_service:'Clasificar casos y redactar respuestas; mensajes, reembolsos y cambios de cuenta requieren aprobación.',customer_experience:`Reseñas registradas: ${view.customer.reviews.records}; convertir fricciones repetidas en propuestas.`,
  compliance:`Expedientes pendientes/bloqueados: ${view.compliance.pending}/${view.compliance.blocked}. Mantener veto ante falta documental.`,legal:'Detectar huecos contractuales; no sustituir revisión legal profesional cuando sea necesaria.',
  enterprise_risk:'Mantener registro de riesgos, concentraciones y continuidad; no aceptar riesgos automáticamente.',security:'Analizar controles, incidencias y dependencias sin modificar secretos ni políticas.',
  development:'Diagnosticar y preparar parches; merge y producción permanecen bloqueados.',sre:'Analizar fiabilidad e incidentes; no desplegar ni activar mantenimiento automáticamente.',
  data_analytics:'Calcular KPIs solo desde definiciones y fuentes trazables.',hr:'Proponer carga, formación y cobertura; no tomar decisiones laborales autónomas.',
  training:'Detectar huecos SOP/formación y crear borradores versionados.',sustainability:'Medir merma y eficiencia solo donde haya datos; no publicar claims ESG sin validación.',
  franchise:'Medir preparación para replicar operaciones; no aprobar aperturas ni franquicias automáticamente.'
 };
 return map[agent]||'Analizar únicamente datos disponibles y separar dato, inferencia, estimación y recomendación.';
}

function deterministicResult(agent,action,view,sourceGate){
 const p=governance.policy(agent,action),assessment=decisions.assess({agent,action,snapshot:{sources:view.sources||{}},requiredSources:REQUIRED_SOURCES[agent]||[]});
 return{agent,action,mode:'deterministic',generatedAt:new Date().toISOString(),validation:sourceGate.status,dataQuality:view.dataQuality,facts:[truth.fact({summary:noteFor(agent,view,sourceGate)},'Nutretium Truth Layer',sourceGate.status,{requiredSources:REQUIRED_SOURCES[agent]||[]})],inferences:[],estimates:[],recommendations:[truth.recommendation(noteFor(agent,view,sourceGate),REQUIRED_SOURCES[agent]||[],assessment.risk)],decision:assessment,requiresHumanDecision:assessment.requiresApproval};
}

async function ollamaGateway(agent,action,view,sourceGate,env=process.env){
 const cfg=providerConfig(env),policy=governance.policy(agent,action);if(!policy.allowed)throw new Error(policy.error);
 const payload={agent,action,validation:sourceGate.status,requiredSources:REQUIRED_SOURCES[agent]||[],businessView:view};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 let response;try{response=await fetch(`${cfg.endpoint}/api/chat`,{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','authorization':`Bearer ${env.AI_OLLAMA_GATEWAY_TOKEN}`},body:JSON.stringify({model:cfg.model||undefined,stream:false,messages:[{role:'system',content:'Eres un empleado IA interno de Nutretium. Está prohibido inventar datos. Devuelve claramente DATO VERIFICADO, INFERENCIA, ESTIMACION y RECOMENDACION. Si falta una fuente necesaria, indica NO VALIDADO. No autorices pagos, compras, precios, mensajes a clientes, cambios de permisos, seguridad, cumplimiento ni despliegues. Nunca pidas ni reveles secretos. Trabaja solo con el businessView resumido y sin inferir datos personales sensibles.'},{role:'user',content:JSON.stringify(payload)}]})})}finally{clearTimeout(timer)}
 if(!response.ok)throw new Error(`Ollama Gateway respondió ${response.status}.`);
 const data=await response.json(),assessment=decisions.assess({agent,action,snapshot:{sources:view.sources||{}},requiredSources:REQUIRED_SOURCES[agent]||[]});
 return{agent,action,mode:'ollama_gateway',generatedAt:new Date().toISOString(),validation:sourceGate.status,dataQuality:view.dataQuality,model:cfg.model||data.model||null,text:String(data?.message?.content||'').slice(0,20000),decision:assessment,requiresHumanDecision:assessment.requiresApproval};
}

async function runWithSnapshot(agent,action,snapshot,env=process.env){
 const p=governance.policy(agent,action);if(!p.allowed)throw new Error(p.error);
 const cfg=providerConfig(env),view=businessView(snapshot),gate=truth.sourceGate(snapshot,REQUIRED_SOURCES[p.agent]||[]);
 const result=cfg.mode==='ollama_gateway'?await ollamaGateway(p.agent,p.action,view,gate,env):deterministicResult(p.agent,p.action,view,gate);
 return{policy:p,provider:{mode:cfg.mode,externalSpendLimitEur:0,model:cfg.model},result};
}
async function run(agent,action,env=process.env){return runWithSnapshot(agent,action,await truth.snapshot(),env)}

async function persistRun({agent,action,requestedBy,startedAt,output}){
 const id=crypto.randomUUID(),record={id,agent,action,status:'completed',requestedBy,startedAt,completedAt:new Date().toISOString(),output};
 await enterprise.save('ai-runs',record,SYSTEM,{id,create:true,reason:'ai-run-complete'});
 await memory.remember({type:'operational',agent,subject:action,content:`Ejecución ${action}: ${output.result.validation||'SIN_VALIDAR'}; decisión ${output.result.decision?.decision||'ANALISIS'}.`,evidence:REQUIRED_SOURCES[agent]||[],confidence:output.result.validation==='VALIDADO'?'high':'low'}).catch(()=>{});
 return record;
}
async function saveRun({agent,action,requestedBy='system',env=process.env}){
 const startedAt=new Date().toISOString();
 try{return await persistRun({agent,action,requestedBy,startedAt,output:await run(agent,action,env)})}catch(error){const id=crypto.randomUUID();await enterprise.save('ai-runs',{id,agent,action,status:'failed',requestedBy,startedAt,failedAt:new Date().toISOString(),error:String(error.message||error).slice(0,1000)},SYSTEM,{id,create:true,reason:'ai-run-failed'}).catch(()=>{});throw Object.assign(error,{runId:id})}
}
async function savePortfolio({requestedBy='scheduled-worker',env=process.env,runs=PORTFOLIO_RUNS}={}){
 providerConfig(env);const snapshot=await truth.snapshot(),results=[];
 for(const [agent,action] of runs){const startedAt=new Date().toISOString();try{const output=await runWithSnapshot(agent,action,snapshot,env),record=await persistRun({agent,action,requestedBy,startedAt,output});results.push({agent,action,status:'completed',id:record.id,validation:output.result.validation})}catch(error){results.push({agent,action,status:'failed',error:String(error.message||error).slice(0,300)})}}
 return{generatedAt:new Date().toISOString(),dataQuality:snapshot.quality,externalSpendLimitEur:0,results};
}

module.exports={providerConfig,businessSnapshot,businessView,deterministicResult,runWithSnapshot,run,saveRun,savePortfolio,PORTFOLIO_RUNS,REQUIRED_SOURCES,SYSTEM};
