'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const guardian=require('../netlify/lib/guardian-policy');

const broken=guardian.safeDispatchPayload({kind:'functional_failure',path:'/producto/creatina',actionId:'Añadir al carrito',message:'Control without observable result'});
assert.strictEqual(broken.incident.kind,'functional_failure');
assert.strictEqual(broken.policy.functionalFailure,true);
assert.strictEqual(broken.policy.canRuntimeRecover,true);
assert.strictEqual(broken.policy.canAutoPatch,false);
assert.strictEqual(broken.policy.requiresCodeReview,true);
assert.match(broken.fingerprint,/^[a-f0-9]{32}$/);

const network=guardian.safeDispatchPayload({kind:'network_5xx',path:'/producto/creatina',method:'GET',url:'/.netlify/functions/catalog-json',status:503,message:'HTTP 503'});
assert.strictEqual(network.policy.serverFailure,true);
assert.strictEqual(network.policy.canImmediateRetry,true);

const payment=guardian.safeDispatchPayload({kind:'network_5xx',path:'/checkout',actionId:'Pagar con Redsys',method:'POST',status:500,message:'HTTP 500'});
assert.strictEqual(payment.policy.protectedArea,true);
assert.strictEqual(payment.policy.canImmediateRetry,false);
assert.strictEqual(payment.policy.canRuntimeRecover,false);
assert.strictEqual(payment.policy.requiresCodeReview,true);

const admin=guardian.classify({kind:'functional_failure',path:'/admin',actionId:'Guardar permisos'});
assert.strictEqual(admin.protectedArea,true);
assert.strictEqual(admin.canRuntimeRecover,false);

const same1=guardian.fingerprint({kind:'error',path:'/x',actionId:'a',message:'boom'});
const same2=guardian.fingerprint({kind:'error',path:'/x',actionId:'a',message:'boom'});
assert.strictEqual(same1,same2);

// Browser-side recovery must never become less restrictive than the server
// policy for high-risk operational areas.
const runtime=fs.readFileSync(path.join(__dirname,'..','guardian-runtime.js'),'utf8').toLowerCase();
for(const term of ['checkout','payment','redsys','refund','password','mfa','totp','admin','staff','permission','role','secret','token','dns','migration','order-finalize']){
 assert.ok(runtime.includes(term),`guardian-runtime must protect sensitive term: ${term}`);
}

// Production certification must prove Guardian is not only present in source,
// but actually served and referenced by the public storefront.
const smoke=fs.readFileSync(path.join(__dirname,'..','.github','workflows','production-smoke.yml'),'utf8');
assert.ok(smoke.includes('Verify Guardian runtime is live'));
assert.ok(smoke.includes('guardian-runtime.js'));
assert.ok(smoke.includes('NUTRETIUM Guardian Runtime'));
assert.ok(smoke.includes('nt:guardian:success'));
assert.ok(smoke.includes('/.netlify/functions/client-error'));

console.log('[guardian] policy, fingerprinting, protected-action and live-smoke tests OK');
