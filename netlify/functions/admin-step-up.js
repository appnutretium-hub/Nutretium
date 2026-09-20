'use strict';

const {cabecerasCORS}=require('../lib/cors');
const {signJWT}=require('../lib/jwt');
const {verifyStaffEventSession}=require('../lib/session');
const {secretFor,verify:verifyTotp}=require('../lib/totp');
const {consume,reset}=require('../lib/rate-limit');
const audit=require('../lib/audit-log');
const security=require('../lib/security-policy');
const stepup=require('../lib/security-step-up');
const defense=require('../lib/security-defense');
const mfaReplay=require('../lib/mfa-replay');

const CORS=cabecerasCORS('POST, OPTIONS');
const response=(statusCode,body,headers={})=>({statusCode,headers:{...CORS,...security.securityHeaders(headers)},body:JSON.stringify(body)});

exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});
 let auth;try{auth=await verifyStaffEventSession(event,{allowBearer:false})}catch{return response(401,{error:'La sesión interna ha caducado.'})}
 let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'JSON no válido.'})}
 if(body.action==='clear')return response(200,{ok:true},{'Set-Cookie':stepup.cookie('',0)});
 if(body.action!=='verify')return response(400,{error:'Acción no reconocida.'});
 const gate=await consume({scope:'staff-step-up',event,extra:auth.email,limit:5,windowMs:10*60*1000});
 if(gate.allowed!==true)return response(gate.degraded?503:429,{error:gate.degraded?'El control de seguridad no está disponible.':'Demasiados intentos de verificación.'},{'Retry-After':String(Math.max(1,Number(gate.retryAfter)||60))});
 const secret=secretFor(auth.email);if(!secret)return response(503,{error:'Esta cuenta no tiene MFA configurado.'});
 const code=String(body.code||'').replace(/\s/g,'');
 if(!verifyTotp(secret,code)){
  await audit.append({event,actor:auth.email,action:'STEP_UP_FAILED',resource:'admin-security',outcome:'DENIED'}).catch(()=>{});
  return response(401,{error:'Código MFA incorrecto.'});
 }
 const once=await mfaReplay.consume(auth.email,code);
 if(!once.ok){
  await audit.append({event,actor:auth.email,action:'STEP_UP_REPLAY_BLOCKED',resource:'admin-security',outcome:'DENIED',metadata:{code:once.code}}).catch(()=>{});
  return response(once.code==='MFA_REPLAY_GUARD_UNAVAILABLE'?503:409,{error:once.error,code:once.code});
 }
 await reset({scope:'staff-step-up',event,extra:auth.email}).catch(()=>false);
 const now=Math.floor(Date.now()/1000),binding=defense.newSessionBinding(event),token=signJWT({sub:auth.user.id,email:auth.email,kind:'staff-step-up',mfa:true,sid:auth.claims.sid,fp:binding.fp,jti:binding.jti,sv:Number(auth.user.sessionVersion||0),exp:now+security.STEP_UP_TTL_SECONDS});
 await audit.append({event,actor:auth.email,action:'STEP_UP_GRANTED',resource:'admin-security',outcome:'SUCCESS',metadata:{ttlSeconds:security.STEP_UP_TTL_SECONDS}}).catch(()=>{});
 return response(200,{ok:true,expiresIn:security.STEP_UP_TTL_SECONDS},{'Set-Cookie':stepup.cookie(token,security.STEP_UP_TTL_SECONDS)});
};
