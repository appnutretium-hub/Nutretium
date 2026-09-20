'use strict';
const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');
const usuarios = require('./usuarios');
const STAFF_COOKIE='nt_staff_session';

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
async function verifyEventSession(event,options={}){const token=tokenFromHeader(event.headers||{});if(!token)throw new Error('Token ausente');return verifyUserToken(token,options)}
function cookieValue(headers={},name){
 const raw=String(headers.cookie||headers.Cookie||'');
 for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}
 return null;
}
function staffMfaRequired(){return String(process.env.REQUIRE_STAFF_MFA||'false').toLowerCase()==='true'}
function validateStaffClaims(claims,kind){
 if(claims.kind!==kind)throw new Error('Sesión interna no válida');
 if(staffMfaRequired()&&claims.mfa!==true)throw new Error('MFA de personal requerido');
}
async function verifyStaffEventSession(event,options={}){
 const cookieToken=cookieValue(event.headers||{},STAFF_COOKIE);
 if(cookieToken){const verified=await verifyUserToken(cookieToken,{requireUser:true});validateStaffClaims(verified.claims,'staff');return{...verified,source:'cookie'}}
 if(options.allowBearer===false)throw new Error('Sesión interna ausente');
 const verified=await verifyEventSession(event,{requireUser:options.requireUser!==false});
 validateStaffClaims(verified.claims,'staff-login');
 return{...verified,source:'bearer'};
}
module.exports={verifyUserToken,verifyEventSession,verifyStaffEventSession,cookieValue,STAFF_COOKIE,staffMfaRequired};