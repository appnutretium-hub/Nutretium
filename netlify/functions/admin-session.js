'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {signJWT}=require('../lib/jwt');
const {verifyEventSession,verifyStaffEventSession,STAFF_COOKIE,staffMfaRequired}=require('../lib/session');
const {permisosDe}=require('../lib/staff');
const CORS=cabecerasCORS('POST, OPTIONS');
const MAX_AGE=8*60*60;
const json=(statusCode,payload,headers={})=>({statusCode,headers:{...CORS,'Cache-Control':'no-store',...headers},body:JSON.stringify(payload)});
const cookie=(value,maxAge)=>`${STAFF_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 if(body.action==='exchange'){
  let verified;try{verified=await verifyEventSession(event,{requireUser:true})}catch{return json(401,{error:'Credencial de acceso no válida o caducada.'})}
  if(verified.claims.kind!=='staff-login')return json(401,{error:'La credencial no procede del acceso de personal.'});
  if(staffMfaRequired()&&verified.claims.mfa!==true)return json(401,{error:'El acceso de personal requiere MFA.'});
  const permisos=permisosDe(verified.email);if(!permisos.size)return json(403,{error:'Esta cuenta no tiene permisos internos.'});
  const now=Math.floor(Date.now()/1000),token=signJWT({sub:verified.user.id,email:verified.email,kind:'staff',mfa:verified.claims.mfa===true,sv:Number(verified.user.sessionVersion||0),exp:now+MAX_AGE});
  return json(200,{ok:true,email:verified.email,permisos:[...permisos],expiresIn:MAX_AGE},{'Set-Cookie':cookie(token,MAX_AGE)});
 }
 if(body.action==='status'){
  let verified;try{verified=await verifyStaffEventSession(event,{allowBearer:false})}catch{return json(401,{error:'Sesión interna no válida o caducada.'})}
  const permisos=permisosDe(verified.email);if(!permisos.size)return json(403,{error:'Esta cuenta ya no tiene permisos internos.'});
  return json(200,{ok:true,email:verified.email,permisos:[...permisos]});
 }
 if(body.action==='logout')return json(200,{ok:true},{'Set-Cookie':cookie('',0)});
 return json(400,{error:'Acción no reconocida.'});
};