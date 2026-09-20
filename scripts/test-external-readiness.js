'use strict';
const assert=require('assert');
const readiness=require('../netlify/lib/external-readiness');

function response(json,status=200){return{ok:status>=200&&status<300,status,json:async()=>json};}
function router(routes){return async(url)=>{for(const [match,value] of routes){if(String(url).includes(match))return typeof value==='function'?value(url):response(value);}return response({error:'not found'},404);};}

(async()=>{
 assert.equal(readiness.senderDomain('Nutretium <pedidos@nutretium.com>'),'nutretium.com');
 assert.equal(readiness.senderDomain('pedidos@nutretium.com'),'nutretium.com');
 assert.equal(readiness.senderDomain('invalido'), '');

 assert.equal(readiness.paymentsState({REDSYS_ENV:'test',COMMERCE_LIVE:'false'}).ready,false);
 assert.equal(readiness.paymentsState({REDSYS_ENV:'production',COMMERCE_LIVE:'true',REDSYS_SECRET_KEY:'secret',REDSYS_MERCHANT_CODE:'merchant'}).ready,true);
 assert.equal(readiness.paymentsState({REDSYS_ENV:'production',COMMERCE_LIVE:'false',REDSYS_SECRET_KEY:'secret',REDSYS_MERCHANT_CODE:'merchant'}).reason,'commerce-live-disabled');

 assert.equal(readiness.shippingState({managed:false,enabled:false,rateCents:null}).ready,false);
 assert.equal(readiness.shippingState({managed:true,enabled:true,rateCents:null}).reason,'missing-valid-rate');
 assert.equal(readiness.shippingState({managed:true,enabled:true,rateCents:495}).ready,true);

 assert.equal(readiness.tpvState({}).ready,false);
 assert.equal(readiness.tpvState({TPVSOL_SYNC_MODE:'api',TPVSOL_SYNC_VALIDATED:'false'}).ready,false);
 assert.equal(readiness.tpvState({TPVSOL_SYNC_MODE:'api',TPVSOL_SYNC_VALIDATED:'true'}).ready,true);
 assert.equal(readiness.tpvState({TPVSOL_SYNC_MODE:'file-export',TPVSOL_SYNC_VALIDATED:'true'}).ready,true);
 assert.equal(readiness.tpvState({TPVSOL_SYNC_MODE:'inventado',TPVSOL_SYNC_VALIDATED:'true'}).ready,false);

 const sha='a'.repeat(40);
 const githubOk=await readiness.githubDeploymentState({GITHUB_REPOSITORY:'appnutretium-hub/Nutretium',GITHUB_TOKEN:'x',COMMIT_REF:sha,CONTEXT:'production',BRANCH:'main'},router([['api.github.com',{commit:{sha}}]]));
 assert.equal(githubOk.ready,true);
 const githubMismatch=await readiness.githubDeploymentState({GITHUB_REPOSITORY:'appnutretium-hub/Nutretium',GITHUB_TOKEN:'x',COMMIT_REF:'b'.repeat(40),CONTEXT:'production',BRANCH:'main'},router([['api.github.com',{commit:{sha}}]]));
 assert.equal(githubMismatch.ready,false);
 assert.equal(githubMismatch.reason,'sha-mismatch');

 const resendOk=await readiness.resendState({RESEND_API_KEY:'x',ORDER_EMAIL_FROM:'Nutretium <pedidos@nutretium.com>'},router([['api.resend.com',{data:[{name:'nutretium.com',status:'verified'}]}]]));
 assert.equal(resendOk.ready,true);
 const resendPending=await readiness.resendState({RESEND_API_KEY:'x',ORDER_EMAIL_FROM:'pedidos@nutretium.com'},router([['api.resend.com',{data:[{name:'nutretium.com',status:'pending'}]}]]));
 assert.equal(resendPending.ready,false);
 assert.equal(resendPending.reason,'domain-not-verified');

 const aggregateFetch=router([
  ['api.github.com',{commit:{sha}}],
  ['api.resend.com',{data:[{name:'nutretium.com',status:'verified'}]}]
 ]);
 const aggregate=await readiness.assessExternalReadiness({
  env:{GITHUB_REPOSITORY:'appnutretium-hub/Nutretium',GITHUB_TOKEN:'x',COMMIT_REF:sha,CONTEXT:'production',BRANCH:'main',RESEND_API_KEY:'x',ORDER_EMAIL_FROM:'pedidos@nutretium.com',REDSYS_ENV:'production',COMMERCE_LIVE:'true',REDSYS_SECRET_KEY:'secret',REDSYS_MERCHANT_CODE:'merchant',TPVSOL_SYNC_MODE:'api',TPVSOL_SYNC_VALIDATED:'true'},
  shipping:{managed:true,enabled:true,rateCents:495},
  fetchImpl:aggregateFetch
 });
 assert.equal(aggregate.ready,true);
 assert.deepEqual(aggregate.blockers,[]);

 const failClosed=await readiness.assessExternalReadiness({env:{REDSYS_ENV:'test'},shipping:{managed:false},fetchImpl:router([])});
 assert.equal(failClosed.ready,false);
 assert.ok(failClosed.blockers.length>=5);
 console.log('External readiness gate: OK');
})().catch(error=>{console.error(error);process.exit(1);});
