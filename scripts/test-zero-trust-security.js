'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
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
 const session=read('netlify/functions/admin-session.js');
 assert(session.includes('csrf=security.randomToken(32)'),'admin session must bind CSRF token');
 assert(session.includes('HttpOnly; Secure; SameSite=Strict'),'staff cookie must be hardened');
 const bridge=read('staff-session-bridge.js');
 assert(bridge.includes('X-Nutretium-CSRF'),'admin bridge must attach CSRF header');
 assert(bridge.includes('STEP_UP_REQUIRED'),'admin bridge must handle step-up challenge');
 for(const file of['netlify/functions/admin-settings.js','netlify/functions/admin-governance.js','netlify/functions/platform-restore.js','netlify/functions/refund-redsys.js'])assert(read(file).includes('verifyStepUp'),`${file} must enforce privileged step-up`);
 console.log('[zero-trust-security] OK · MFA + cookie HttpOnly + CSRF + step-up obligatorios en producción');
}finally{resetEnv()}
