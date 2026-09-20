'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const policy=require('../netlify/lib/security-policy');
const snapshot={...process.env};
function resetEnv(){for(const k of Object.keys(process.env))if(!(k in snapshot))delete process.env[k];for(const[k,v]of Object.entries(snapshot))process.env[k]=v}
function read(p){return fs.readFileSync(path.join(__dirname,'..',p),'utf8')}
try{
 process.env.CONTEXT='production';process.env.REQUIRE_STAFF_MFA='true';process.env.REQUIRE_STAFF_COOKIE='false';process.env.REQUIRE_STAFF_CSRF='false';process.env.REQUIRE_STAFF_STEP_UP='false';
 assert.equal(policy.productionLike(),true);assert.equal(policy.staffMfaRequired(),false,'MFA global debe estar retirado: la política es individual por empleado');assert.equal(policy.staffCookieRequired(),true);assert.equal(policy.staffCsrfRequired(),true);assert.equal(policy.staffStepUpRequired(),true);
 const csrf=policy.randomToken(32);assert(csrf.length>=40);assert.throws(()=>policy.assertStaffCsrf({httpMethod:'POST',headers:{}},{csrf}),/CSRF/);assert.throws(()=>policy.assertStaffCsrf({httpMethod:'POST',headers:{'x-nutretium-csrf':'wrong'}},{csrf}),/CSRF/);assert.equal(policy.assertStaffCsrf({httpMethod:'POST',headers:{'x-nutretium-csrf':csrf}},{csrf}),true);
 const login=read('netlify/functions/staff-login.js');assert(login.includes('STAFF_LOGIN_TTL_SECONDS'));assert(login.includes('mfaReplay.consume'));assert(login.includes('newSessionBinding'));assert(login.includes('privilegedMfaExempt'));assert(login.includes('user?.mfaEnabled===true'));
 const session=read('netlify/functions/admin-session.js');assert(session.includes('csrf=security.randomToken(32)'));assert(session.includes('HttpOnly; Secure; SameSite=Strict'));assert(session.includes('sid:binding.sid'));
 const bridge=read('staff-session-bridge.js');assert(bridge.includes('X-Nutretium-CSRF'));assert(bridge.includes('X-Nutretium-Request'));assert(bridge.includes('STEP_UP_REQUIRED'));
 const stepup=read('netlify/lib/security-step-up.js');assert(stepup.includes("claims.sid!==auth.claims.sid"));assert(stepup.includes("['owner','admin']"),'Owner/Admin deben quedar exentos del step-up MFA');
 for(const file of['netlify/functions/admin-settings.js','netlify/functions/admin-governance.js','netlify/functions/platform-restore.js','netlify/functions/refund-redsys.js']){const source=read(file);assert(source.includes('verifyStepUp'),`${file} must enforce privileged step-up policy`);assert(source.includes('consumeMutationNonce'),`${file} must enforce anti-replay on critical mutation`)}
 console.log('[zero-trust-security] OK · MFA individual + admin exento + cookie HttpOnly + CSRF + session binding + anti-replay obligatorios en producción');
 execFileSync(process.execPath,[path.join(__dirname,'test-defense-in-depth.js')],{stdio:'inherit',env:{...process.env,NUTRETIUM_TEST_MEMORY_BLOBS:'true',CONTEXT:'production',URL:'https://nutretium.com'}});
}finally{resetEnv()}
