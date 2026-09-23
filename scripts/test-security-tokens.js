'use strict';
require('./test-env');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET='test-security-secret-abcdefghijklmnopqrstuvwxyz-123456789';

const assert=require('assert');
const crypto=require('crypto');
const usuarios=require('../netlify/lib/usuarios');
const {getBlobStore}=require('../netlify/lib/blob-store');
const security=require('../netlify/functions/account-security');

const email='security-test@nutretium.test';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const event=(body,ip='127.0.0.77')=>({httpMethod:'POST',headers:{'x-nf-client-connection-ip':ip,host:'nutretium.com'},body:JSON.stringify(body)});
const parse=r=>JSON.parse(r.body||'{}');

(async()=>{
  await usuarios.escribe(email,{id:'security-user',name:'Security',surname:'Test',email,phone:'',direccion:{calle:'Calle Test 1',piso:'',cp:'39001',localidad:'Santander',provincia:'Cantabria',pais:'España'},passwordHash:'old'});

  const rawReset='reset-token-concurrente-seguro';
  const resetKey=hash(rawReset);
  const resetStore=getBlobStore('password-resets');
  await resetStore.setJSON(resetKey,{email,hash:resetKey,expiresAt:Date.now()+60000,used:false,createdAt:new Date().toISOString()});
  const resetResults=await Promise.all([
    security.handler(event({action:'reset-password',resetToken:rawReset,newPassword:'Nueva-clave-segura-123'},'127.0.0.78')),
    security.handler(event({action:'reset-password',resetToken:rawReset,newPassword:'Otra-clave-segura-456'},'127.0.0.78'))
  ]);
  assert.strictEqual(resetResults.filter(r=>r.statusCode===200).length,1,'El token de reset solo puede consumirse una vez');
  assert.strictEqual(resetResults.filter(r=>r.statusCode===400).length,1,'La segunda petición simultánea debe rechazar el token ya reclamado');
  const resetRecord=await resetStore.get(resetKey,{type:'json'});assert.strictEqual(resetRecord.used,true,'El token de reset debe quedar cerrado');
  const updated=await usuarios.lee(email);assert(Number(updated.tokensValidAfter)>0,'El reset debe revocar sesiones anteriores');

  const rawVerify='verify-token-concurrente-seguro';
  const verifyKey=hash(rawVerify);
  const verifyStore=getBlobStore('email-verifications');
  await verifyStore.setJSON(verifyKey,{email,hash:verifyKey,expiresAt:Date.now()+60000,used:false,createdAt:new Date().toISOString()});
  const verifyResults=await Promise.all([
    security.handler(event({action:'verify-email',verifyToken:rawVerify},'127.0.0.79')),
    security.handler(event({action:'verify-email',verifyToken:rawVerify},'127.0.0.79'))
  ]);
  assert.strictEqual(verifyResults.filter(r=>r.statusCode===200).length,1,'El token de verificación solo puede consumirse una vez');
  assert.strictEqual(verifyResults.filter(r=>r.statusCode===400).length,1,'La segunda verificación simultánea debe rechazarse');
  const verified=await usuarios.lee(email);assert(verified.emailVerifiedAt,'La cuenta debe quedar verificada');
  const verifyRecord=await verifyStore.get(verifyKey,{type:'json'});assert.strictEqual(verifyRecord.used,true,'El token de verificación debe quedar cerrado');

  console.log('[test-security-tokens] OK · reset y verificación son one-time bajo concurrencia');
})().catch(err=>{console.error(err);process.exit(1)});
