'use strict';
require('./test-env');
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-only-jwt-secret-with-sufficient-entropy-123456789';

const session=require('../netlify/lib/session');
const enterprise=require('../netlify/lib/enterprise-store');
const outbox=require('../netlify/lib/outbox');
const auth=require('../netlify/functions/auth');
const outboxWorker=require('../netlify/functions/outbox-worker');
const {getBlobStore}=require('../netlify/lib/blob-store');

async function testCustomerCookie(){
 const cookie=session.customerSessionCookie('signed-token-value');
 assert(cookie.startsWith(`${session.CUSTOMER_COOKIE}=`),'La cookie cliente debe usar el nombre centralizado.');
 assert(cookie.includes('HttpOnly'),'La sesión cliente debe ser HttpOnly.');
 assert(cookie.includes('Secure'),'La sesión cliente debe ser Secure.');
 assert(cookie.includes('SameSite=Lax'),'La sesión cliente debe limitar CSRF cross-site.');
 assert(cookie.includes('Path=/'),'La sesión cliente debe ser válida para toda la aplicación.');
 const cleared=session.clearCustomerSessionCookie();
 assert(cleared.includes('Max-Age=0'),'Logout debe expirar la cookie inmediatamente.');
 assert.strictEqual(session.bearerValue({authorization:'Bearer undefined'}),null,'Bearer undefined no debe bloquear el fallback a cookie.');
 assert.strictEqual(session.bearerValue({authorization:'Bearer null'}),null,'Bearer null no debe bloquear el fallback a cookie.');
}

async function testLegacyUpgradeSetsCookie(){
 const user={id:'customer-test',name:'Test',surname:'Customer',email:'customer-test@nutretium.invalid',phone:'',direccion:{calle:'Calle Test 1',cp:'39000',localidad:'Santander',provincia:'Cantabria',pais:'España'},sessionVersion:0};
 const response=auth._test.profileResponse(user,{source:'legacy',email:user.email});
 assert(response.headers['Set-Cookie'],'Una sesión legacy validada debe ascender a cookie HttpOnly.');
 assert(response.headers['Set-Cookie'].includes('HttpOnly'),'La cookie de migración debe ser HttpOnly.');
 const cookieResponse=auth._test.profileResponse(user,{source:'cookie',email:user.email});
 assert(!cookieResponse.headers['Set-Cookie'],'Una sesión ya basada en cookie no debe rotarse en cada lectura de perfil.');
}

async function testEnterpriseOptimisticConcurrency(){
 const actor={email:'owner-test@nutretium.invalid',role:'owner'};
 await enterprise.save('warehouses',{code:'SANTANDER',name:'Santander',status:'active'},actor,{id:'warehouse-test',create:true});
 const staleA=await enterprise.getEntry('warehouses','warehouse-test');
 const staleB=await enterprise.getEntry('warehouses','warehouse-test');
 assert(staleA.etag&&staleB.etag&&staleA.etag===staleB.etag,'Las lecturas concurrentes deben capturar el mismo ETag inicial.');
 const store=getBlobStore(enterprise.STORE);
 await enterprise.conditionalWrite(store,staleA.key,{...staleA.data,name:'Santander A',version:Number(staleA.data.version||0)+1},staleA);
 let rejected=false;
 try{
  await enterprise.conditionalWrite(store,staleB.key,{...staleB.data,name:'Santander B',version:Number(staleB.data.version||0)+1},staleB);
 }catch(err){rejected=err&&err.code==='CONFLICT';}
 assert(rejected,'Una escritura con ETag obsoleto debe fallar con CONFLICT y no sobrescribir cambios ajenos.');
 const final=await enterprise.get('warehouses','warehouse-test');
 assert.strictEqual(final.name,'Santander A','La actualización concurrente obsoleta no debe producir lost update.');
}

async function testDurableOutbox(){
 const first=await outbox.enqueue('order.customer_email','order:TEST-1',{order:'TEST-1',email:'client-test@nutretium.invalid',amount:9.9,fulfillment:'shipping'});
 const duplicate=await outbox.enqueue('order.customer_email','order:TEST-1',{order:'TEST-1',email:'client-test@nutretium.invalid',amount:9.9,fulfillment:'shipping'});
 assert.strictEqual(first.id,duplicate.id,'La outbox debe ser idempotente por tipo+clave.');
 const due=await outbox.due(20),candidate=due.find(x=>x.job.id===first.id);assert(candidate,'El job pendiente debe aparecer como ejecutable.');
 const claimed=await outbox.claim(candidate.path);assert(claimed,'Un worker debe poder reclamar el job.');
 const secondClaim=await outbox.claim(candidate.path);assert.strictEqual(secondClaim,null,'Un segundo worker no debe poder reclamar el mismo job simultáneamente.');
 assert(await outbox.finish(claimed.path,claimed.claimId,{ok:true}),'El worker debe poder cerrar el job reclamado.');
 const stats=await outbox.stats();assert(stats.completed>=1,'La outbox debe registrar jobs completados.');
 const mail=outboxWorker._test.orderEmail({order:'TEST-1',email:'client-test@nutretium.invalid',amount:9.9,fulfillment:'shipping'});
 assert.strictEqual(mail.idempotencyKey,'nutretium-enterprise-finalize/TEST-1','El email de pedido debe conservar una clave idempotente estable.');
}

(async()=>{
 await testCustomerCookie();
 await testLegacyUpgradeSetsCookie();
 await testEnterpriseOptimisticConcurrency();
 await testDurableOutbox();
 console.log('Architecture hardening: OK');
})().catch(err=>{console.error(err);process.exit(1)});
