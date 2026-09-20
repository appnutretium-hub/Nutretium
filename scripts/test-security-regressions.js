'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET='regression-secret-abcdefghijklmnopqrstuvwxyz-123456';
process.env.URL='https://nutretium.com';
process.env.REDSYS_ENV='test';
process.env.COMMERCE_LIVE='false';
process.env.MAINTENANCE_MODE='false';
globalThis.__NUTRETIUM_TEST_BLOBS__=new Map();
globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map();

const usuarios=require('../netlify/lib/usuarios');
const {signJWT,verifyJWT}=require('../netlify/lib/jwt');
const {verifyUserToken}=require('../netlify/lib/session');
const {getBlobStore}=require('../netlify/lib/blob-store');
const customerCommerce=require('../netlify/functions/customer-commerce');
const checkoutSecure=require('../netlify/functions/checkout-enterprise-secure');
const legacyReset=require('../netlify/functions/password-reset');

function signedWithHeader(header,payload){const h=Buffer.from(JSON.stringify(header)).toString('base64url'),b=Buffer.from(JSON.stringify(payload)).toString('base64url'),sig=crypto.createHmac('sha256',process.env.JWT_SECRET).update(`${h}.${b}`).digest('base64url');return`${h}.${b}.${sig}`}
(async()=>{
 const email='revocation@example.com',user={id:'u-revoke',email,name:'Revoca',surname:'Test',sessionVersion:0,tokensValidAfter:0,passwordHash:'x'};
 await usuarios.escribe(email,user);
 const token=signJWT({sub:user.id,email,kind:'customer',sv:0,exp:Math.floor(Date.now()/1000)+3600,iat:1});
 const claims=verifyJWT(token);assert.notStrictEqual(claims.iat,1,'El llamador no puede elegir iat');
 await verifyUserToken(token,{requireUser:true});
 await usuarios.muta(email,current=>({...current,sessionVersion:1,tokensValidAfter:Math.floor(Date.now()/1000)}));
 await assert.rejects(()=>verifyUserToken(token,{requireUser:true}),/revocada/i,'sessionVersion debe revocar aunque iat coincida en el mismo segundo');
 const commerce=await customerCommerce.handler({httpMethod:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({action:'overview'})});
 assert.strictEqual(commerce.statusCode,401,'Customer commerce debe respetar revocación');

 const now=Math.floor(Date.now()/1000);const algNone=signedWithHeader({alg:'none',typ:'JWT'},{sub:'x',email,exp:now+60});assert.throws(()=>verifyJWT(algNone),/cabecera/i,'JWT con alg distinto de HS256 debe rechazarse');
 assert.throws(()=>verifyJWT(token+'.extra'),/malformado/i,'JWT con cuatro segmentos debe rechazarse');

 const cuenta=fs.readFileSync('cuenta.js','utf8');assert(cuenta.includes("currentPassword:$('oldPassword').value"),'Mi Cuenta debe enviar currentPassword al backend');

 const blocked=await checkoutSecure.handler({httpMethod:'POST',headers:{host:'nutretium.com','x-nf-client-connection-ip':'127.0.0.210'},body:JSON.stringify({action:'pay',items:[],guest:{email:'a@b.com',name:'A'}})});
 assert.strictEqual(blocked.statusCode,503,'Producción no puede iniciar cobro Enterprise sin COMMERCE_LIVE y Redsys production');
 process.env.MAINTENANCE_MODE='true';
 const maintenance=await checkoutSecure.handler({httpMethod:'POST',headers:{host:'preview.local','x-nf-client-connection-ip':'127.0.0.211'},body:JSON.stringify({action:'quote',items:[]})});
 assert.strictEqual(maintenance.statusCode,503,'Mantenimiento debe bloquear checkout Enterprise antes de efectos');
 process.env.MAINTENANCE_MODE='false';

 const resetStore=getBlobStore('password-reset-v1'),raw='x'.repeat(40),key=legacyReset._test.digest(raw);await resetStore.setJSON(key,{email,expiresAt:Date.now()+60000,used:false});
 const claimsRace=await Promise.all(Array.from({length:8},()=>legacyReset._test.claimToken(resetStore,key)));assert.strictEqual(claimsRace.filter(Boolean).length,1,'El reset legacy debe poder reclamarse una sola vez bajo concurrencia');
 console.log('[test-security-regressions] OK · JWT estricto · revocación exacta · Mi Cuenta · checkout fail-closed · reset legacy atómico');
})().catch(err=>{console.error(err);process.exit(1)});