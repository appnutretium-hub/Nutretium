'use strict';

const assert=require('assert');
const runtime=require('../netlify/lib/enterprise-workforce-runtime');
const governance=require('../netlify/lib/agent-governance');

const workforce=governance.workforce;
const allSources=['inventory','orders','products','suppliers','purchaseOrders','compliance','productCompliance','incidents','systemIncidents','shipments','returns','customers','reviews','analytics','reconciliation','invoices','promotions','experiments','integrations','automationRules','staff','priceHistory','productCosts','marketplace','subscriptions','loyalty','crmTickets'];
const verified=Object.fromEntries(allSources.map(k=>[k,{source:k,status:'VERIFICADO',records:1,score:100}]));
const data=Object.fromEntries(allSources.map(k=>[k,[]]));
data.orders=[{id:'o1',status:'paid',totalCents:1290,createdAt:new Date().toISOString()}];
data.products=[{id:'p1',status:'active',priceCents:1290,updatedAt:new Date().toISOString()}];
data.inventory=[{id:'i1',sku:'SKU-1',onHand:10,reserved:1,reorderPoint:3,updatedAt:new Date().toISOString()}];
data.analytics=[{id:'a1',type:'page_view',createdAt:new Date().toISOString()}];
data.productCompliance=[{id:'c1',status:'approved',updatedAt:new Date().toISOString()}];
data.compliance=[{id:'c2',status:'approved',updatedAt:new Date().toISOString()}];
data.suppliers=[{id:'s1',status:'validated',updatedAt:new Date().toISOString()}];
data.invoices=[{id:'inv1',status:'open',updatedAt:new Date().toISOString()}];
data.reconciliation=[{id:'rec1',status:'completed',updatedAt:new Date().toISOString()}];
data.staff=[{id:'st1',status:'active',updatedAt:new Date().toISOString()}];
data.systemIncidents=[{id:'si1',status:'resolved',updatedAt:new Date().toISOString()}];
data.integrations=[{id:'int1',status:'active',updatedAt:new Date().toISOString()}];
data.reviews=[{id:'rev1',status:'open',updatedAt:new Date().toISOString()}];
data.crmTickets=[{id:'t1',status:'open',updatedAt:new Date().toISOString()}];
data.purchaseOrders=[{id:'po1',status:'draft',updatedAt:new Date().toISOString()}];
data.incidents=[{id:'inc1',status:'resolved',updatedAt:new Date().toISOString()}];
const snapshot={generatedAt:new Date().toISOString(),sources:verified,data,quality:{sources:allSources.length,usable:allSources.length,coveragePct:100,status:'PARCIALMENTE_VALIDADO'}};

(async()=>{
  const status=runtime.status();
  assert.strictEqual(status.ok,true,'La plantilla operativa debe validar.');
  assert(status.roles>=90,'Se esperan al menos 90 puestos operativos.');
  assert.strictEqual(status.families,18,'Se esperan 18 familias.');

  for(const [id,role] of Object.entries(workforce.ROLES)){
    const plan=runtime.rolePlan(id);
    assert.strictEqual(plan.ok,true,`${id}: plan no válido`);
    assert.strictEqual(plan.title,role.title,`${id}: título inconsistente`);
    assert(plan.agent.startsWith('workforce__'),`${id}: identidad operativa no aislada`);
    if(role.autonomous.length)assert(plan.defaultAction,`${id}: falta acción por defecto`);
  }

  const bi=await runtime.runRoleWithSnapshot({id:'bi_analyst',snapshot,env:{AI_PROVIDER:'deterministic',AI_EXTERNAL_SPEND_LIMIT_EUR:'0'}});
  assert.strictEqual(bi.result.status,'COMPLETED','BI debe poder ejecutar con fuentes válidas.');
  assert.strictEqual(bi.result.validation,'VALIDADO','BI debe quedar validado con fuentes válidas.');
  assert.strictEqual(bi.policy.autonomous,true,'BI debe ejecutar acción de bajo riesgo.');
  assert(Array.isArray(bi.result.facts)&&bi.result.facts.length>=2,'BI debe devolver hechos trazables.');

  const supply=await runtime.runRoleWithSnapshot({id:'inventory_manager',snapshot,env:{AI_PROVIDER:'deterministic',AI_EXTERNAL_SPEND_LIMIT_EUR:'0'}});
  assert.strictEqual(supply.result.status,'COMPLETED','Inventario debe ejecutar su análisis.');
  assert.strictEqual(supply.result.role.family,'supply','Inventario debe conservar familia supply.');

  const incomplete={...snapshot,sources:{...snapshot.sources,analytics:{source:'analytics',status:'NO_VALIDADO',records:0,score:0}}};
  const growth=await runtime.runRoleWithSnapshot({id:'growth_manager',snapshot:incomplete,env:{AI_PROVIDER:'deterministic',AI_EXTERNAL_SPEND_LIMIT_EUR:'0'}});
  assert.strictEqual(growth.result.status,'NO_VALIDADO','Growth debe bloquear conclusiones sin analytics válido.');
  assert.strictEqual(growth.result.validation,'NO_VALIDADO');
  assert.strictEqual(growth.result.estimates.length,0,'No debe emitir estimaciones con fuentes requeridas inválidas.');

  const critical=await runtime.runRoleWithSnapshot({id:'chief_financial',action:'capital-allocation',snapshot,env:{AI_PROVIDER:'deterministic',AI_EXTERNAL_SPEND_LIMIT_EUR:'0'}});
  assert.strictEqual(critical.result.status,'HUMAN_APPROVAL_REQUIRED','Capital allocation debe permanecer bloqueado.');
  assert.strictEqual(critical.policy.requiresApproval,true,'Capital allocation requiere aprobación humana.');

  const family=runtime.familyPlan('supply');
  assert.strictEqual(family.label,'Supply Chain, Compras & Logística');
  assert(family.roles.length>=6,'Supply debe tener plantilla operativa amplia.');

  const now=new Date('2026-09-21T10:00:00Z');
  assert(Object.prototype.hasOwnProperty.call(workforce.FAMILIES,runtime.scheduledFamily(now)),'La rotación debe resolver una familia existente.');

  console.log(JSON.stringify({ok:true,roles:status.roles,families:status.families,bi:bi.result.status,supply:supply.result.status,missingData: growth.result.status,critical:critical.result.status},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
