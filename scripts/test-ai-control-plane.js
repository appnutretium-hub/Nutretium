'use strict';
const assert=require('assert');
const governance=require('../netlify/lib/agent-governance');
const runtime=require('../netlify/lib/ai-runtime');

const expected=['director','sales','inventory','purchasing','marketing','ecommerce','customer_service','logistics','finance','compliance','security','development','operations'];
for(const name of expected)assert(governance.AGENTS[name],`Falta agente ${name}`);

const safe=governance.policy('inventory','low-stock-scan');
assert.equal(safe.allowed,true);
assert.equal(safe.autonomous,true);
assert.equal(safe.requiresApproval,false);

for(const [agent,action] of [
 ['finance','refund'],['purchasing','purchase-order-send'],['development','production-deploy'],['security','secret-rotate'],['compliance','product-approve'],['operations','integration-enable']
]){
 const p=governance.policy(agent,action);
 assert.equal(p.allowed,true,`${agent}/${action} no reconocido`);
 assert.equal(p.requiresApproval,true,`${agent}/${action} no exige aprobación`);
 assert.equal(p.autonomous,false,`${agent}/${action} quedó autónomo`);
}
assert.equal(governance.canApprove({proposedBy:'owner@x.test'},{email:'owner@x.test',role:'owner'}),false,'Autoprobación permitida');
assert.equal(governance.canApprove({proposedBy:'staff@x.test'},{email:'owner@x.test',role:'owner'}),true,'Owner distinto no puede aprobar');

assert.deepEqual(runtime.providerConfig({}),{mode:'deterministic',externalSpendLimitEur:0,endpoint:null,model:null});
assert.throws(()=>runtime.providerConfig({AI_EXTERNAL_SPEND_LIMIT_EUR:'0.01'}),/debe permanecer en 0/);
assert.throws(()=>runtime.providerConfig({AI_PROVIDER:'openai'}),/no permitido/);
assert.throws(()=>runtime.providerConfig({AI_PROVIDER:'ollama_gateway',AI_OLLAMA_GATEWAY_URL:'http://localhost:11434'}),/HTTPS y token/);
const ollama=runtime.providerConfig({AI_PROVIDER:'ollama_gateway',AI_OLLAMA_GATEWAY_URL:'https://ai.example.test/',AI_OLLAMA_GATEWAY_TOKEN:'test-token',AI_OLLAMA_MODEL:'local-model'});
assert.equal(ollama.externalSpendLimitEur,0);
assert.equal(ollama.endpoint,'https://ai.example.test');
assert.equal(ollama.model,'local-model');

const snapshot={inventory:{records:1,lowStock:1,negativeAvailable:0,examples:[]},orders:{records:0,byStatus:{},grossRecorded:0},catalog:{records:0,inactive:0,missingPrice:0},compliance:{records:0,blocked:0,pending:0},incidents:{records:0,open:0}};
const result=runtime.deterministicResult('inventory','low-stock-scan',snapshot);
assert.equal(result.mode,'deterministic');
assert(result.recommendations.length>0);
assert.equal(result.facts,snapshot);

console.log('AI Control Plane regressions: OK');
