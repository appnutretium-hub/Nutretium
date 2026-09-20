'use strict';

const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.CONTEXT='production';
process.env.URL='https://nutretium.com';

const security=require('../netlify/lib/security-policy');
const defense=require('../netlify/lib/security-defense');
const mfaReplay=require('../netlify/lib/mfa-replay');

function event({origin='https://nutretium.com',ua='Nutretium-Test/1.0',lang='es-ES',request='req-1234567890-abcdef',contentType='application/json',site='same-origin'}={}){
 return{httpMethod:'POST',headers:{origin,'user-agent':ua,'accept-language':lang,'content-type':contentType,'sec-fetch-site':site,'x-nutretium-request':request},body:'{"action":"test"}'};
}

(async()=>{
 assert.equal(security.productionLike(),true);
 assert.equal(defense.assertBrowserBoundary(event()),true,'same-origin JSON request must pass');
 assert.throws(()=>defense.assertBrowserBoundary(event({origin:'https://evil.example'})),/Origen no autorizado/,'foreign origin must fail');
 assert.throws(()=>defense.assertBrowserBoundary(event({site:'cross-site'})),/cross-site/,'cross-site fetch must fail');
 assert.throws(()=>defense.assertBrowserBoundary(event({contentType:'text/plain'})),/Content-Type/,'non-JSON privileged mutation must fail');

 const fp=defense.requestFingerprint(event());
 assert(fp.length>=40,'browser fingerprint must have sufficient digest length');
 assert.equal(defense.assertSessionBinding(event(),{fp}),true,'matching browser binding must pass');
 assert.throws(()=>defense.assertSessionBinding(event({ua:'Different-UA/9'}),{fp}),/contexto/,'stolen session from another browser context must fail');
 assert.throws(()=>defense.assertSessionBinding(event(),{}),/ligada/,'unbound production session must fail');

 const first=await defense.consumeMutationNonce({event:event(),actor:'owner@nutretium.test',scope:'critical-test'});
 assert.equal(first.ok,true,'first privileged mutation nonce must pass');
 const replay=await defense.consumeMutationNonce({event:event(),actor:'owner@nutretium.test',scope:'critical-test'});
 assert.equal(replay.ok,false,'same privileged mutation nonce must be rejected');
 assert.equal(replay.code,'REPLAY_BLOCKED');
 const second=await defense.consumeMutationNonce({event:event({request:'req-9876543210-fedcba'}),actor:'owner@nutretium.test',scope:'critical-test'});
 assert.equal(second.ok,true,'fresh request id must pass');

 const mfa1=await mfaReplay.consume('owner@nutretium.test','123456');
 assert.equal(mfa1.ok,true,'first valid-format MFA code use must pass replay gate');
 const mfa2=await mfaReplay.consume('owner@nutretium.test','123456');
 assert.equal(mfa2.ok,false,'same MFA code must never be reusable');
 assert.equal(mfa2.code,'MFA_REPLAY_BLOCKED');

 const binding=defense.newSessionBinding(event());
 assert(binding.sid.length>=30&&binding.jti.length>=30&&binding.fp===fp,'session binding must carry independent high-entropy identifiers');

 console.log('[defense-in-depth] OK · origin boundary + browser binding + mutation replay guard + MFA replay guard');
})().catch(err=>{console.error(err);process.exit(1)});
