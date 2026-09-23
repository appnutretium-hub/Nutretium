'use strict';
require('./test-env');

const assert=require('assert');
const workforce=require('../netlify/lib/enterprise-workforce');
const governance=require('../netlify/lib/agent-governance');

const validation=workforce.validate();
assert.strictEqual(validation.ok,true,`Workforce inválida: ${validation.errors.join('; ')}`);
assert(validation.roles>=90,`Se esperaban al menos 90 puestos IA y hay ${validation.roles}`);
assert(validation.families>=18,`Se esperaban al menos 18 familias y hay ${validation.families}`);

const root=workforce.hierarchy();
assert(root&&root.id==='chief_executive','La jerarquía debe partir de chief_executive.');
assert(workforce.directReports('chief_executive').length>=10,'CEO IA debe tener cobertura ejecutiva amplia.');

for(const [id,r] of Object.entries(workforce.ROLES)){
  assert(r.mission&&r.mission.length>20,`${id}: misión insuficiente`);
  assert(r.responsibilities.length>=3,`${id}: responsabilidades insuficientes`);
  assert(r.kpis.length>=3,`${id}: KPIs insuficientes`);
  assert(r.scopes.length>=1,`${id}: sin scopes`);
  for(const a of r.autonomous){
    assert(!workforce.FORBIDDEN_AUTONOMY.has(a),`${id}: acción crítica autónoma ${a}`);
  }
  const agentId=governance.workforceAgentId(id);
  assert.strictEqual(agentId,`workforce__${id}`,`${id}: identidad Enterprise no canónica`);
  const p=governance.profile(agentId);
  assert(p&&p.source==='enterprise-workforce',`${id}: no conectado a governance.profile() mediante ${agentId}`);
  assert.strictEqual(p.roleId,id,`${id}: roleId incorrecto`);
}

for(const collision of ['data_quality','enterprise_risk','product_innovation']){
  assert.strictEqual(governance.profile(collision).source,'legacy',`${collision}: el agente heredado debe conservarse`);
  const enterpriseId=governance.workforceAgentId(collision);
  assert.notStrictEqual(enterpriseId,collision,`${collision}: la identidad enterprise debe estar namespaced`);
  assert.strictEqual(governance.profile(enterpriseId).source,'enterprise-workforce',`${enterpriseId}: puesto enterprise no accesible`);
}

const blocked=[
  ['chief_financial','capital-allocation'],
  ['frontend_engineer','code-merge'],
  ['platform_engineer','production-deploy'],
  ['chief_security','secret-rotate'],
  ['chief_people','employment-decision'],
  ['procurement_manager','purchase-order-send'],
  ['food_safety_director','lot-release'],
  ['regulatory_affairs','claim-approve'],
  ['ecommerce_director','price-change']
];
for(const [roleId,action] of blocked){
  const agent=governance.workforceAgentId(roleId),p=governance.policy(agent,action);
  assert.strictEqual(p.allowed,true,`${agent}/${action} debe ser reconocida`);
  assert.strictEqual(p.autonomous,false,`${agent}/${action} no puede ser autónoma`);
  assert.strictEqual(p.requiresApproval,true,`${agent}/${action} debe requerir aprobación`);
}

const safe=[
  ['bi_analyst','kpi-brief'],
  ['data_quality','quality-scan'],
  ['market_intelligence','market-scan'],
  ['qa_engineer','test-plan'],
  ['inventory_manager','rotation-scan'],
  ['support_agent','case-triage']
];
for(const [roleId,action] of safe){
  const agent=governance.workforceAgentId(roleId),p=governance.policy(agent,action);
  assert.strictEqual(p.allowed,true,`${agent}/${action} debe ser reconocida`);
  assert.strictEqual(p.autonomous,true,`${agent}/${action} debería ser autónoma de bajo riesgo`);
}

for(const id of workforce.VETO_ROLES){
  const agent=governance.workforceAgentId(id);
  assert.strictEqual(governance.profile(agent).vetoAgent,true,`${agent} debe conservar capacidad de veto`);
}

const registry=governance.publicRegistry();
for(const id of Object.keys(workforce.ROLES)){
  const key=`workforce__${id}`;
  assert(registry[key],`${key}: falta en el registro público`);
  assert.strictEqual(registry[key].roleId,id,`${key}: roleId inconsistente en registro público`);
}

const summary=governance.workforceSummary();
assert.strictEqual(summary.ok,true,'El resumen de plantilla debe ser válido.');
assert.strictEqual(summary.collisionSafe,true,'El registro debe declarar identidades collision-safe.');
assert.strictEqual(summary.totalRegistered,summary.legacyAgents+summary.roles,'Ningún puesto puede sobrescribir otro registro.');

console.log(JSON.stringify({ok:true,roles:validation.roles,families:validation.families,vetoRoles:validation.vetoRoles,totalRegistered:summary.totalRegistered,collisionSafe:summary.collisionSafe},null,2));
