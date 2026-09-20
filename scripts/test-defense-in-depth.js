'use strict';
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.CONTEXT='production';
process.env.URL='https://nutretium.com';
const security=require('../netlify/lib/security-policy');
const defense=require('../netlify/lib/security-defense');
const mfaReplay=require('../netlify/lib/mfa-replay');
const audit=require('../netlify/lib/audit-log');
const {getBlobStore}=require('../netlify/lib/blob-store');
function event({origin='https://nutretium.com',ua='Nutretium-Test/1.0',lang='es-ES',request='req-1234567890-abcdef',contentType='application/json',site='same-origin'}={}){return{httpMethod:'POST',headers:{origin,'user-agent':ua,'accept-language':lang,'content-type':contentType,'sec-fetch-site':site,'x-nutretium-request':request,'x-nf-client-connection-ip':'127.0.0.90'},body:'{"action":"test"}'}}
(async()=>{
 assert.equal(security.productionLike(),true);
 assert.equal(defense.assertBrowserBoundary(event()),true);
 assert.throws(()=>defense.assertBrowserBoundary(event({origin:'https://evil.example'})),/Origen no autorizado/);
 assert.throws(()=>defense.assertBrowserBoundary(event({site:'cross-site'})),/cross-site/);
 assert.throws(()=>defense.assertBrowserBoundary(event({contentType:'text/plain'})),/Content-Type/);
 const fp=defense.requestFingerprint(event());assert(fp.length>=40);assert.equal(defense.assertSessionBinding(event(),{fp}),true);assert.throws(()=>defense.assertSessionBinding(event({ua:'Different-UA/9'}),{fp}),/contexto/);assert.throws(()=>defense.assertSessionBinding(event(),{}),/ligada/);
 const first=await defense.consumeMutationNonce({event:event(),actor:'owner@nutretium.test',scope:'critical-test'});assert.equal(first.ok,true);
 const replay=await defense.consumeMutationNonce({event:event(),actor:'owner@nutretium.test',scope:'critical-test'});assert.equal(replay.ok,false);assert.equal(replay.code,'REPLAY_BLOCKED');
 const second=await defense.consumeMutationNonce({event:event({request:'req-9876543210-fedcba'}),actor:'owner@nutretium.test',scope:'critical-test'});assert.equal(second.ok,true);
 const mfa1=await mfaReplay.consume('owner@nutretium.test','123456');assert.equal(mfa1.ok,true);const mfa2=await mfaReplay.consume('owner@nutretium.test','123456');assert.equal(mfa2.ok,false);assert.equal(mfa2.code,'MFA_REPLAY_BLOCKED');
 const binding=defense.newSessionBinding(event());assert(binding.sid.length>=30&&binding.jti.length>=30&&binding.fp===fp);
 await audit.append({event:event({request:'audit-seed-1234567890'}),actor:'owner@nutretium.test',action:'SECURITY_TEST',resource:'defense'});const intact=await defense.verifyAuditIntegrity();assert.equal(intact.ok,true);
 const store=getBlobStore('security-audit'),head=await store.get('chain-head',{type:'json',consistency:'strong'}),latest=await store.get(head.key,{type:'json',consistency:'strong'});await store.setJSON(head.key,{...latest,resource:'tampered'});const broken=await defense.verifyAuditIntegrity();assert.equal(broken.ok,false);assert.equal(broken.code,'AUDIT_INTEGRITY_FAILED');
 console.log('[defense-in-depth] OK · origin boundary + browser binding + anti-replay + MFA replay + audit integrity fail-closed');
})().catch(err=>{console.error(err);process.exit(1)});
