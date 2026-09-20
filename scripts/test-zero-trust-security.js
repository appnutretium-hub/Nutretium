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
 process.env.CONTEXT='production';
 process.env.REQUIRE_STAFF_MFA='false';
 process.env.REQUIRE_STAFF_COOKIE='false';
 process.env.REQUIRE_STAFF_CSRF='false';
 process.env.REQUIRE_STAFF_STEP_UP='false';
 assert.equal(policy.productionLike(),true,'production context must be detected');
 assert.equal(policy.staffMfaRequired(),true,'production MFA cannot be disabled');
 assert.equal(policy.staffCookieRequired(),true,'production HttpOnly staff cookie cannot be disabled');
 assert.equal(policy.staffCsrfRequired(),true,'production CSRF cannot be disabled');
 assert.equal(policy.staffStepUpRequired(),true,'production step-up cannot be disabled');
 const csrf=policy.randomToken(32);assert(csrf.length>=40,'CSRF token must have adequate entropy');
 assert.throws(()=>policy.assertStaffCsrf({httpMethod:'POST',headers:{}},{csrf}),/CSRF/,'missing CSRF must fail');
 assert.throws(()=>policy.assertStaffCsrf({httpMethod:'POST',headers:{'x-nutretium-csrf':'wrong'}},{csrf}),/CSRF/,'wrong CSRF must fail');
 assert.equal(policy.assertStaffCsrf({httpMethod:'POST',headers:{'x-nutretium-csrf':csrf}},{csrf}),true,'matching CSRF must pass');
 const login=read('netlify/functions/staff-login.js');
 assert(login.includes('STAFF_LOGIN_TTL_SECONDS'),'staff login must use short bootstrap TTL');
 assert(login.includes('mfaReplay.consume'),'staff login must prevent TOTP replay');
 assert(login.includes('newSessionBinding'),'staff login must be browser-bound');
 const session=read('netlify/functions/admin-session.js');
 assert(session.includes('csrf=security.randomToken(32)'),'admin session must bind CSRF token');
 assert(session.includes('HttpOnly; Secure; SameSite=Strict'),'staff cookie must be hardened');
 assert(session.includes('sid:binding.sid'),'admin session must carry a session identifier');
 const bridge=read('staff-session-bridge.js');
 assert(bridge.includes('X-Nutretium-CSRF'),'admin bridge must attach CSRF header');
 assert(bridge.includes('X-Nutretium-Request'),'admin bridge must attach an anti-replay request id');
 assert(bridge.includes('STEP_UP_REQUIRED'),'admin bridge must handle step-up challenge');
 const stepup=read('netlify/lib/security-step-up.js');
 assert(stepup.includes("claims.sid!==auth.claims.sid"),'step-up token must be tied to the active staff session');
 for(const file of['netlify/functions/admin-settings.js','netlify/functions/admin-governance.js','netlify/functions/platform-restore.js','netlify/functions/refund-redsys.js']){
  const source=read(file);
  assert(source.includes('verifyStepUp'),`${file} must enforce privileged step-up`);
  assert(source.includes('consumeMutationNonce'),`${file} must enforce anti-replay on critical mutation`);
 }
 console.log('[zero-trust-security] OK · MFA + cookie HttpOnly + CSRF + session binding + step-up + anti-replay obligatorios en producción');
 execFileSync(process.execPath,[path.join(__dirname,'test-defense-in-depth.js')],{stdio:'inherit',env:{...process.env,NUTRETIUM_TEST_MEMORY_BLOBS:'true',CONTEXT:'production',URL:'https://nutretium.com'}});
}finally{resetEnv()}
