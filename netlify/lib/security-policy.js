'use strict';

const crypto=require('crypto');

const STAFF_LOGIN_TTL_SECONDS=5*60;
const STAFF_SESSION_TTL_SECONDS=30*60;
const STEP_UP_TTL_SECONDS=10*60;
const STAFF_IDLE_REAUTH_SECONDS=15*60;

function boolEnv(name,fallback=false){
 const raw=process.env[name];
 if(raw===undefined||raw===null||String(raw).trim()==='')return fallback;
 return String(raw).trim().toLowerCase()==='true';
}

function productionLike(){
 if(String(process.env.CONTEXT||'').toLowerCase()==='production')return true;
 if(boolEnv('COMMERCE_LIVE',false))return true;
 for(const candidate of[process.env.URL,process.env.DEPLOY_PRIME_URL]){
  try{if(candidate&&new URL(candidate).hostname.toLowerCase()==='nutretium.com')return true}catch{}
 }
 return false;
}

function envSecurityFlag(name){
 if(process.env[name]!==undefined&&String(process.env[name]).trim()!=='')return boolEnv(name);
 return productionLike();
}
function staffMfaRequired(){return envSecurityFlag('REQUIRE_STAFF_MFA')}
function staffCsrfRequired(){return envSecurityFlag('REQUIRE_STAFF_CSRF')}
function staffCookieRequired(){return envSecurityFlag('REQUIRE_STAFF_COOKIE')}

function randomToken(bytes=32){return crypto.randomBytes(bytes).toString('base64url')}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y)}
function mutatingMethod(method){return!['GET','HEAD','OPTIONS'].includes(String(method||'GET').toUpperCase())}

function assertStaffCsrf(event,claims){
 if(!mutatingMethod(event?.httpMethod)||!staffCsrfRequired())return true;
 const headers=event?.headers||{};
 const supplied=headers['x-nutretium-csrf']||headers['X-Nutretium-CSRF'];
 if(!safeEqual(supplied,claims?.csrf))throw Object.assign(new Error('CSRF inválido'),{code:'CSRF_INVALID'});
 return true;
}

function securityHeaders(extra={}){
 return{
  'Cache-Control':'no-store',
  'Pragma':'no-cache',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  ...extra,
 };
}

module.exports={
 STAFF_LOGIN_TTL_SECONDS,
 STAFF_SESSION_TTL_SECONDS,
 STEP_UP_TTL_SECONDS,
 STAFF_IDLE_REAUTH_SECONDS,
 productionLike,
 staffMfaRequired,
 staffCsrfRequired,
 staffCookieRequired,
 randomToken,
 safeEqual,
 mutatingMethod,
 assertStaffCsrf,
 securityHeaders,
};
