'use strict';
require('./test-env');
const assert=require('assert');
const governance=require('../netlify/lib/agent-governance');
const runtime=require('../netlify/lib/ai-runtime');
const truth=require('../netlify/lib/ai-truth-layer');
const decisions=require('../netlify/lib/ai-decision-engine');
const memory=require('../netlify/lib/ai-memory');

const expected=['executive_brain','strategy','audit','data_quality','sales','forecasting','inventory','purchasing','suppliers','logistics','operations','product_innovation','category_management','pricing','finance','procurement_control','marketing','growth','crm','ecommerce','seo','marketplace','customer_service','customer_experience','compliance','legal','enterprise_risk','security','development','sre','data_analytics','hr','training','sustainability','franchise'];
assert.equal(expected.length,35,'La plantilla corporativa debe mantener 35 agentes.');
for(const name of expected){assert(governance.AGENTS[name],`Falta agente ${name}`);assert(governance.AGENTS[name].department,`${name} sin departamento`);assert(governance.AGENTS[name].autonomous.length,`${name} sin tarea autónoma`)}
assert.equal(Object.keys(governance.AGENTS).length,expected.length,'Hay agentes sin prueba o faltan agentes en el registro esperado.');
assert.equal(runtime.PORTFOLIO_RUNS.length,expected.length,'El ciclo diario no cubre toda la plantilla.');
for(const [agent,action] of runtime.PORTFOLIO_RUNS){const p=governance.policy(agent,action);assert.equal(p.allowed,true,`${agent}/${action} no reconocido`);assert.equal(p.autonomous,true,`${agent}/${action} no es autónomo`);assert.equal(p.requiresApproval,false,`${agent}/${action} exige aprobación y no debe estar en el worker`)}

for(const [agent,action] of [['finance','refund'],['purchasing','purchase-order-send'],['development','production-deploy'],['security','secret-rotate'],['compliance','product-approve'],['operations','integration-enable'],['hr','employment-decision'],['legal','contract-commit'],['strategy','capital-allocation']]){
 const p=governance.policy(agent,action);assert.equal(p.allowed,true,`${agent}/${action} no reconocido`);assert.equal(p.requiresApproval,true,`${agent}/${action} no exige aprobación`);assert.equal(p.autonomous,false,`${agent}/${action} quedó autónomo`);
}
assert.equal(governance.canApprove({proposedBy:'owner@x.test'},{email:'owner@x.test',role:'owner'}),false,'Autoprobación permitida');
assert.equal(governance.canApprove({proposedBy:'staff@x.test'},{email:'owner@x.test',role:'owner'}),true,'Owner distinto no puede aprobar');
for(const name of ['audit','compliance','enterprise_risk','security','finance','procurement_control'])assert(governance.VETO_AGENTS.has(name),`Falta veto ${name}`);

assert.deepEqual(runtime.providerConfig({}),{mode:'deterministic',externalSpendLimitEur:0,endpoint:null,model:null});
assert.throws(()=>runtime.providerConfig({AI_EXTERNAL_SPEND_LIMIT_EUR:'0.01'}),/debe permanecer en 0/);
for(const provider of ['openai','anthropic','gemini','groq'])assert.throws(()=>runtime.providerConfig({AI_PROVIDER:provider}),/no permitido/);
assert.throws(()=>runtime.providerConfig({AI_PROVIDER:'ollama_gateway',AI_OLLAMA_GATEWAY_URL:'http://localhost:11434'}),/HTTPS y token/);
const ollama=runtime.providerConfig({AI_PROVIDER:'ollama_gateway',AI_OLLAMA_GATEWAY_URL:'https://ai.example.test/',AI_OLLAMA_GATEWAY_TOKEN:'test-token',AI_OLLAMA_MODEL:'local-model'});
assert.equal(ollama.externalSpendLimitEur,0);assert.equal(ollama.endpoint,'https://ai.example.test');assert.equal(ollama.model,'local-model');

const fresh=truth.quality('orders',[{id:'o1',updatedAt:new Date().toISOString()}]);
assert.equal(fresh.status,'VERIFICADO');
const empty=truth.quality('orders',[]);assert.equal(empty.status,'NO_VALIDADO');
assert.equal(truth.fact(1,'orders').type,'DATO');assert.equal(truth.inference('x').type,'INFERENCIA');assert.equal(truth.estimate(2,'media').type,'ESTIMACION');assert.equal(truth.recommendation('x').type,'RECOMENDACION');
const fakeSnapshot={sources:{orders:fresh,inventory:fresh,products:fresh,productCosts:fresh},data:{inventory:[{id:'i1',sku:'SKU',onHand:2,reserved:0,reorderPoint:3,reorderQty:4,updatedAt:new Date().toISOString()}],orders:[{id:'o1',status:'paid',totalCents:1000,updatedAt:new Date().toISOString()}],products:[{id:'p1',priceCents:1000,updatedAt:new Date().toISOString()}],productCosts:[{id:'c1',updatedAt:new Date().toISOString()}]},quality:{coveragePct:100,status:'PARCIALMENTE_VALIDADO'}};
const view=runtime.businessView(fakeSnapshot);assert.equal(view.inventory.lowStock,1);assert.equal(view.orders.records,1);assert(!Object.prototype.hasOwnProperty.call(view,'customers'),'El businessView no debe exponer datos personales crudos.');
const gate=truth.sourceGate(fakeSnapshot,['inventory']);assert.equal(gate.ok,true);
const result=runtime.deterministicResult('inventory','low-stock-scan',view,gate);assert.equal(result.mode,'deterministic');assert.equal(result.validation,'VALIDADO');assert(result.facts.every(x=>x.type==='DATO'));assert(result.recommendations.every(x=>x.type==='RECOMENDACION'));
const missingGate=truth.sourceGate(fakeSnapshot,['suppliers']);assert.equal(missingGate.status,'NO_VALIDADO');
const blocked=decisions.assess({agent:'purchasing',action:'purchase-order-send',snapshot:fakeSnapshot,requiredSources:['inventory','orders'],estimatedImpactEur:500});assert.equal(blocked.decision,'HUMAN_APPROVAL_REQUIRED');assert(blocked.vetoes.some(x=>x.agent==='finance'));
const safe=decisions.assess({agent:'inventory',action:'low-stock-scan',snapshot:fakeSnapshot,requiredSources:['inventory']});assert.equal(safe.decision,'AUTO');assert.equal(decisions.canExecute(safe,[]),true);
assert.equal(memory.TYPES.has('fact'),true);assert.equal(memory.TYPES.has('learning'),true);

console.log('AI Corporation premium regressions: OK');
