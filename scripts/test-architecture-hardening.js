'use strict';
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-only-jwt-secret-with-sufficient-entropy-123456789';

const session=require('../netlify/lib/session');
const enterprise=require('../netlify/lib/enterprise-store');
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

(async()=>{
 await testCustomerCookie();
 await testEnterpriseOptimisticConcurrency();
 console.log('Architecture hardening: OK');
})().catch(err=>{console.error(err);process.exit(1)});
