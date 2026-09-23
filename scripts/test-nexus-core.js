'use strict';
require('./test-env');
const assert=require('assert');
const nexus=require('../netlify/lib/nexus-core');
const governance=require('../netlify/lib/agent-governance');

const validation=nexus.validateArchitecture();
assert.equal(validation.ok,true,validation.errors.join('\n'));
assert.equal(validation.components,40,'Nexus debe contener exactamente 40 componentes.');
assert.equal(nexus.COMPONENTS.length,40);
assert.equal(new Set(nexus.COMPONENTS.map(x=>x.id)).size,40,'No puede haber componentes duplicados.');
assert(Object.keys(governance.AGENTS).length>=35,'La plantilla corporativa de agentes debe seguir disponible.');

for(const component of nexus.COMPONENTS){
 assert(component.domain,`${component.id} sin dominio`);
 assert(component.criticality,`${component.id} sin criticidad`);
 for(const dep of component.dependencies){
   if(dep==='policy_engine')continue;
   assert(nexus.COMPONENT_MAP[dep],`${component.id} depende de ${dep} inexistente`);
 }
}

const status=nexus.systemStatus();
assert.equal(status.status,'operational');
assert.equal(status.components.total,40);
assert.equal(status.components.operational,40);
assert.equal(status.safety.externalAISpendLimitEur,0);
assert.equal(status.safety.controlDataPlaneSeparated,true);
assert.equal(status.safety.failClosed,true);
assert.equal(status.policyEngine.implementation,'agent-governance');

const event=nexus.createEvent('order.created',{orderId:'o1'},{source:'test'});
assert.equal(event.type,'order.created');
assert.equal(event.payload.orderId,'o1');
assert(nexus.routeEvent('order.created').includes('fulfillment_engine'));
assert(nexus.routeEvent('stock.low').includes('supply_chain_brain'));
assert.deepEqual(nexus.routeEvent('unknown.event'),[]);
assert.throws(()=>nexus.createEvent('x',{}),/Tipo de evento no válido/);
assert.throws(()=>nexus.createEvent('order.created',[]),/payload/);

(async()=>{
 const bus=new nexus.NexusEventBus();let seen=0;
 const unsubscribe=bus.subscribe('order.created',async e=>{seen++;return e.payload.orderId;});
 const published=await bus.publish('order.created',{orderId:'o2'});
 assert.equal(seen,1);assert.equal(published.delivered,1);assert.equal(published.results[0].ok,true);unsubscribe();

 const workflow=await nexus.executeWorkflow({name:'order-flow',steps:['validate','reserve'],context:{value:1},handlers:{validate:async s=>({value:s.value+1}),reserve:async s=>({reserved:s.value===2})}});
 assert.equal(workflow.status,'completed');assert.equal(workflow.state.reserved,true);
 const failed=await nexus.executeWorkflow({name:'fail-closed',steps:['a','b'],handlers:{a:async()=>({ok:true}),b:async()=>{throw new Error('boom')}}});
 assert.equal(failed.status,'failed');assert.equal(failed.steps[1].status,'failed');

 const envelope=nexus.financialEnvelope({estimatedImpactCents:5000,approvedLimitCents:6000,approved:true});
 assert.equal(envelope.canExecute,true);
 assert.equal(nexus.financialEnvelope({estimatedImpactCents:7000,approvedLimitCents:6000,approved:true}).canExecute,false);
 assert.equal(nexus.financialEnvelope({estimatedImpactCents:10,approvedLimitCents:100,approved:false}).canExecute,false);

 assert.equal(nexus.riskTierForAction('development','production-deploy'),'R4');
 assert.equal(nexus.guardedAssessment({agent:'development',action:'self-permission-change'}).decision,'BLOCKED');
 assert.equal(nexus.guardedAssessment({agent:'development',action:'self-permission-change'}).riskTier,'R5');

 assert.equal(nexus.evaluateOutput('normal output').ok,true);
 assert.equal(nexus.evaluateOutput('api_key=abcdefghijklmnopqrstuvwxyz123456').ok,false);
 assert.equal(nexus.evaluateOutput({validation:'NO_VALIDADO',facts:[{x:1}]}).ok,false);

 const model=nexus.selectModel({complexity:'high'},{});assert.equal(model.route,'deterministic');assert.equal(model.externalSpendLimitEur,0);
 const sim=nexus.simulateScenario({baseline:{sales:100,margin:20},changes:{sales:10,margin:-2}});assert.equal(sim.type,'ESTIMACION');assert.equal(sim.result.sales,110);assert.equal(sim.result.margin,18);

 const features=nexus.featureVector({orders:{records:4},inventory:{lowStock:2,negativeAvailable:1},catalog:{records:10},compliance:{blocked:1,pending:3},suppliers:{records:2},operations:{incidents:{records:1}},digital:{analyticsRecords:20}});
 assert.deepEqual(features,{orders:4,lowStock:2,negativeStock:1,catalog:10,complianceBlocked:1,compliancePending:3,suppliers:2,incidents:1,analyticsRecords:20});

 console.log('Nutretium Nexus 40-component regressions: OK');
})().catch(error=>{console.error(error);process.exit(1)});
