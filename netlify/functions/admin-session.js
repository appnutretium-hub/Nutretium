'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {signJWT}=require('../lib/jwt');
const {verifyEventSession,verifyStaffEventSession,STAFF_COOKIE}=require('../lib/session');
const {effectivePermissions}=require('../lib/staff');
const security=require('../lib/security-policy');
const defense=require('../lib/security-defense');
const CORS=cabecerasCORS('POST, OPTIONS');
const MAX_AGE=security.STAFF_SESSION_TTL_SECONDS;
const json=(statusCode,payload,headers={})=>({statusCode,headers:{...CORS,...security.securityHeaders(headers)},body:JSON.stringify(payload)});
const cookie=(value,maxAge)=>`${STAFF_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
async function currentPermissions(email){const result=await effectivePermissions(email),permissions=result.permissions||new Set();return{member:result.member,permissions}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 try{defense.assertBrowserBoundary(event)}catch(e){return json(403,{error:e.message,code:e.code||'REQUEST_BLOCKED'})}
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 if(body.action==='exchange'){
  let verified;try{verified=await verifyEventSession(event,{requireUser:true})}catch{return json(401,{error:'Credencial de acceso no válida o caducada.'})}
  if(verified.claims.kind!=='staff-login')return json(401,{error:'La credencial no procede del acceso de personal.'});
  try{defense.assertSessionBinding(event,verified.claims)}catch{return json(401,{error:'La credencial cambió de contexto. Vuelve a iniciar sesión.'})}
  const current=await currentPermissions(verified.email);if(!current.permissions.size||current.member?.active===false||current.member?.role==='client')return json(403,{error:'Esta cuenta no tiene permisos internos.'});
  const role=String(current.member?.role||''),mfaRequired=['owner','admin'].includes(role)||security.staffMfaRequired()||verified.user?.mfaEnabled===true;
  if(mfaRequired&&verified.claims.mfa!==true)return json(401,{error:'La sesión interna requiere autenticación MFA verificada.',code:'STAFF_MFA_REQUIRED'});
  const now=Math.floor(Date.now()/1000),csrf=security.randomToken(32),binding=defense.newSessionBinding(event),token=signJWT({sub:verified.user.id,email:verified.email,role,kind:'staff',mfa:verified.claims.mfa===true,csrf,sid:binding.sid,fp:binding.fp,jti:binding.jti,sv:Number(verified.user.sessionVersion||0),exp:now+MAX_AGE});
  return json(200,{ok:true,email:verified.email,role,permisos:[...current.permissions],expiresIn:MAX_AGE,csrf,mfa:verified.claims.mfa===true},{'Set-Cookie':cookie(token,MAX_AGE)});
 }
 if(body.action==='status'){
  let verified;try{verified=await verifyStaffEventSession(event,{allowBearer:false,skipCsrf:true})}catch{return json(401,{error:'Sesión interna no válida o caducada.'})}
  const current=await currentPermissions(verified.email);if(!current.permissions.size||current.member?.active===false||current.member?.role==='client')return json(403,{error:'Esta cuenta ya no tiene permisos internos.'});
  return json(200,{ok:true,email:verified.email,role:current.member.role,permisos:[...current.permissions],csrf:verified.claims.csrf||null,expiresAt:verified.claims.exp||null,mfa:verified.claims.mfa===true});
 }
 if(body.action==='logout')return json(200,{ok:true},{'Set-Cookie':cookie('',0)});
 return json(400,{error:'Acción no reconocida.'});
};
exports._test={currentPermissions};
