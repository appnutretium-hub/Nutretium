'use strict';
const {verifyUserToken,cookieValue}=require('./session');
const security=require('./security-policy');
const defense=require('./security-defense');
const STEP_UP_COOKIE='nt_staff_stepup';
function cookie(value,maxAge=security.STEP_UP_TTL_SECONDS){return `${STEP_UP_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0,Number(maxAge)||0)}`}
async function verifyStepUp(event,auth){
 if(['owner','admin'].includes(String(auth?.role||'')))return{ok:true,bypassed:true,reason:'privileged-mfa-exempt'};
 if(!security.staffStepUpRequired())return{ok:true,bypassed:true};
 const token=cookieValue(event?.headers||{},STEP_UP_COOKIE);if(!token)return{ok:false,statusCode:428,error:'Reautenticación requerida.',code:'STEP_UP_REQUIRED'};
 try{const verified=await verifyUserToken(token,{requireUser:true}),claims=verified.claims||{};if(claims.kind!=='staff-step-up'||claims.mfa!==true)return{ok:false,statusCode:428,error:'Reautenticación requerida.',code:'STEP_UP_REQUIRED'};if(String(verified.email||'').toLowerCase()!==String(auth?.email||'').toLowerCase())return{ok:false,statusCode:428,error:'Reautenticación requerida.',code:'STEP_UP_REQUIRED'};if(!claims.sid||!auth?.claims?.sid||claims.sid!==auth.claims.sid)return{ok:false,statusCode:428,error:'La reautenticación no pertenece a esta sesión.',code:'STEP_UP_REQUIRED'};defense.assertSessionBinding(event,claims);return{ok:true,claims:verified.claims,email:verified.email}}catch{return{ok:false,statusCode:428,error:'Reautenticación requerida.',code:'STEP_UP_REQUIRED'}}
}
module.exports={STEP_UP_COOKIE,cookie,verifyStepUp};
