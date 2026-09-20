'use strict';
const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');
const usuarios = require('./usuarios');
const security=require('./security-policy');
const defense=require('./security-defense');
const STAFF_COOKIE='nt_staff_session';
const CUSTOMER_COOKIE='nt_customer_session';
const CUSTOMER_SESSION_TTL_SECONDS=60*60*24*30;

async function verifyUserToken(token,options={}){
 if(!secretConfigured())throw new Error('Sesiones no configuradas');
 const claims=verifyJWT(token),email=String(claims.email||'').toLowerCase();if(!email)throw new Error('Token sin usuario');
 const user=await usuarios.lee(email);
 if(!user&&options.requireUser!==false)throw new Error('Usuario no encontrado');
 if(user){
  const version=Number(user.sessionVersion||0),claimVersion=claims.sv===undefined?null:Number(claims.sv);
  if(version>0&&claimVersion!==version)throw new Error('Sesión revocada');
  const validAfter=Number(user.tokensValidAfter||0),issuedAt=Number(claims.iat||0);if(validAfter&&(!issuedAt||issuedAt<validAfter))throw new Error('Sesión revocada');
 }
 return{claims,user:user||null,email};
}
function cookieValue(headers={},name){
 const raw=String(headers.cookie||headers.Cookie||'');
 for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}
 return null;
}
function bearerValue(headers={}){
 const value=tokenFromHeader(headers);if(!value)return null;
 const normalized=String(value).trim().toLowerCase();return normalized==='undefined'||normalized==='null'||normalized==='none'?null:value;
}
async function verifyEventSession(event,options={}){
 const headers=event?.headers||{},token=bearerValue(headers)||cookieValue(headers,CUSTOMER_COOKIE);
 if(!token)throw new Error('Token ausente');return verifyUserToken(token,options);
}
function customerSessionCookie(token,maxAge=CUSTOMER_SESSION_TTL_SECONDS){return `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,Number(maxAge)||0)}`}
function clearCustomerSessionCookie(){return customerSessionCookie('',0)}
async function verifyCustomerEventSession(event,options={}){
 const headers=event?.headers||{},cookieToken=cookieValue(headers,CUSTOMER_COOKIE);
 if(cookieToken){const verified=await verifyUserToken(cookieToken,{requireUser:options.requireUser!==false});if(verified.claims.kind!=='customer')throw new Error('Sesión de cliente no válida');return{...verified,source:'cookie'}}
 if(options.allowBearer===false)throw new Error('Sesión de cliente ausente');
 const bearer=bearerValue(headers),legacy=options.legacyToken||null,token=bearer||legacy;if(!token)throw new Error('Sesión de cliente ausente');
 const verified=await verifyUserToken(token,{requireUser:options.requireUser!==false});if(verified.claims.kind&&verified.claims.kind!=='customer')throw new Error('Sesión de cliente no válida');return{...verified,source:bearer?'bearer':'legacy'};
}
function validateStaffClaims(claims,kind){
 if(claims.kind!==kind)throw new Error('Sesión interna no válida');
 if(security.productionLike()&&!claims.jti)throw new Error('Sesión sin identificador de seguridad');
 if(security.productionLike()&&kind==='staff'&&!claims.sid)throw new Error('Sesión interna sin identificador');
}
async function verifyStaffEventSession(event,options={}){
 defense.assertBrowserBoundary(event);
 const cookieToken=cookieValue(event.headers||{},STAFF_COOKIE);
 if(cookieToken){
  const verified=await verifyUserToken(cookieToken,{requireUser:true});validateStaffClaims(verified.claims,'staff');defense.assertSessionBinding(event,verified.claims);
  if(options.skipCsrf!==true)security.assertStaffCsrf(event,verified.claims);return{...verified,source:'cookie'};
 }
 if(options.allowBearer===false||security.staffCookieRequired())throw new Error('Sesión interna ausente');
 const bearer=bearerValue(event.headers||{});if(!bearer)throw new Error('Sesión interna ausente');
 const verified=await verifyUserToken(bearer,{requireUser:options.requireUser!==false});validateStaffClaims(verified.claims,'staff-login');defense.assertSessionBinding(event,verified.claims);return{...verified,source:'bearer'};
}
module.exports={verifyUserToken,verifyEventSession,verifyCustomerEventSession,verifyStaffEventSession,cookieValue,bearerValue,customerSessionCookie,clearCustomerSessionCookie,CUSTOMER_COOKIE,CUSTOMER_SESSION_TTL_SECONDS,STAFF_COOKIE};
