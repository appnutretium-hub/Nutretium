'use strict';
const crypto=require('crypto');
const {cabecerasCORS}=require('../lib/cors');
const {verifyJWT,tokenFromHeader,secretConfigured}=require('../lib/jwt');
const {getBlobStore}=require('../lib/blob-store');
const usuarios=require('../lib/usuarios');
const {sendEmail}=require('../lib/email');
const {consume}=require('../lib/rate-limit');
const CORS=cabecerasCORS('POST, OPTIONS');
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL=30*60*1000,VERIFY_TTL=24*60*60*1000;
const json=(statusCode,payload,headers={})=>({statusCode,headers:{...CORS,...headers},body:JSON.stringify(payload)});
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.pbkdf2Sync(password,salt,100_000,64,'sha512').toString('hex');return`${salt}:${hash}`}
function verifyPassword(password,stored){try{const[salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;const attempt=crypto.pbkdf2Sync(password,salt,100_000,64,'sha512').toString('hex');const a=Buffer.from(hash,'hex'),b=Buffer.from(attempt,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}}
function validPassword(p){return typeof p==='string'&&p.length>=8&&p.length<=128}
function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex')}
function resetStore(){return getBlobStore('password-resets')}
function verifyStore(){return getBlobStore('email-verifications')}
function publicOrigin(event){const host=String(event.headers?.['x-forwarded-host']||event.headers?.host||'nutretium.com').replace(/[^a-zA-Z0-9.:-]/g,'');return `https://${host||'nutretium.com'}`}
function authEmail(event){if(!secretConfigured())return null;const token=tokenFromHeader(event.headers||{});if(!token)return null;try{return verifyJWT(token).email||null}catch{return null}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 if(body.action==='change-password'){
  const email=authEmail(event);if(!email)return json(401,{error:'Debes iniciar sesión.'});
  const current=String(body.currentPassword||''),next=String(body.newPassword||'');if(!validPassword(next))return json(400,{error:'La nueva contraseña debe tener entre 8 y 128 caracteres.'});
  const rate=await consume({scope:'password-change',event,extra:email,limit:5,windowMs:15*60*1000}).catch(()=>({allowed:true}));if(!rate.allowed)return json(429,{error:'Demasiados intentos. Espera unos minutos.'},{'Retry-After':String(rate.retryAfter)});
  const user=await usuarios.lee(email);if(!user||!verifyPassword(current,user.passwordHash))return json(401,{error:'La contraseña actual no es correcta.'});
  user.passwordHash=hashPassword(next);user.passwordChangedAt=new Date().toISOString();await usuarios.escribe(email,user);return json(200,{ok:true,message:'Contraseña actualizada.'});
 }
 if(body.action==='request-reset'){
  const email=String(body.email||'').trim().toLowerCase();if(!EMAIL.test(email))return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
  const rate=await consume({scope:'password-reset-request',event,extra:email,limit:3,windowMs:30*60*1000}).catch(()=>({allowed:true}));if(!rate.allowed)return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
  const user=await usuarios.lee(email);if(!user)return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
  const store=resetStore();if(!store)return json(503,{error:'La recuperación de contraseña no está disponible temporalmente.'});
  const raw=crypto.randomBytes(32).toString('base64url'),record={email,hash:tokenHash(raw),expiresAt:Date.now()+RESET_TTL,used:false,createdAt:new Date().toISOString()};await store.setJSON(record.hash,record);
  const link=`${publicOrigin(event)}/mi-nutretium?reset=${encodeURIComponent(raw)}`;
  await sendEmail({to:email,subject:'Recupera tu contraseña · Nutretium',html:`<p>Has solicitado cambiar la contraseña de tu cuenta Nutretium.</p><p><a href="${link}">Crear una nueva contraseña</a></p><p>El enlace caduca en 30 minutos y solo puede utilizarse una vez.</p>`,idempotencyKey:`nutretium-reset/${record.hash.slice(0,24)}`});
  return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
 }
 if(body.action==='reset-password'){
  const raw=String(body.resetToken||''),next=String(body.newPassword||'');if(!raw||!validPassword(next))return json(400,{error:'Enlace o contraseña no válidos.'});
  const rate=await consume({scope:'password-reset-use',event,limit:8,windowMs:30*60*1000}).catch(()=>({allowed:true}));if(!rate.allowed)return json(429,{error:'Demasiados intentos. Espera unos minutos.'},{'Retry-After':String(rate.retryAfter)});
  const store=resetStore();if(!store)return json(503,{error:'La recuperación de contraseña no está disponible temporalmente.'});
  const key=tokenHash(raw),record=await store.get(key,{type:'json'}).catch(()=>null);if(!record||record.used||Date.now()>Number(record.expiresAt||0))return json(400,{error:'Este enlace no es válido o ha caducado.'});
  const user=await usuarios.lee(record.email);if(!user)return json(400,{error:'Este enlace no es válido o ha caducado.'});
  user.passwordHash=hashPassword(next);user.passwordChangedAt=new Date().toISOString();await usuarios.escribe(record.email,user);record.used=true;record.usedAt=new Date().toISOString();await store.setJSON(key,record);return json(200,{ok:true,message:'Contraseña actualizada. Ya puedes iniciar sesión.'});
 }
 if(body.action==='verification-status'){
  const email=authEmail(event);if(!email)return json(401,{error:'Debes iniciar sesión.'});const user=await usuarios.lee(email);return json(200,{verified:Boolean(user?.emailVerifiedAt),verifiedAt:user?.emailVerifiedAt||null});
 }
 if(body.action==='request-verification'){
  const email=authEmail(event);if(!email)return json(401,{error:'Debes iniciar sesión.'});const user=await usuarios.lee(email);if(!user)return json(404,{error:'Cuenta no encontrada.'});if(user.emailVerifiedAt)return json(200,{ok:true,verified:true,message:'Tu email ya está verificado.'});
  const rate=await consume({scope:'email-verify-request',event,extra:email,limit:3,windowMs:60*60*1000}).catch(()=>({allowed:true}));if(!rate.allowed)return json(429,{error:'Has solicitado varios enlaces. Espera antes de pedir otro.'},{'Retry-After':String(rate.retryAfter)});
  const store=verifyStore();if(!store)return json(503,{error:'La verificación no está disponible temporalmente.'});const raw=crypto.randomBytes(32).toString('base64url'),hash=tokenHash(raw);await store.setJSON(hash,{email,hash,expiresAt:Date.now()+VERIFY_TTL,used:false,createdAt:new Date().toISOString()});const link=`${publicOrigin(event)}/mi-nutretium?verify=${encodeURIComponent(raw)}`;await sendEmail({to:email,subject:'Verifica tu email · Nutretium',html:`<p>Confirma que este email pertenece a tu cuenta Nutretium.</p><p><a href="${link}">Verificar email</a></p><p>El enlace caduca en 24 horas y solo puede utilizarse una vez.</p>`,idempotencyKey:`nutretium-verify/${hash.slice(0,24)}`});return json(200,{ok:true,message:'Te hemos enviado un enlace de verificación si el servicio de correo está disponible.'});
 }
 if(body.action==='verify-email'){
  const raw=String(body.verifyToken||'');if(!raw)return json(400,{error:'Enlace de verificación no válido.'});const store=verifyStore();if(!store)return json(503,{error:'La verificación no está disponible temporalmente.'});const hash=tokenHash(raw),record=await store.get(hash,{type:'json'}).catch(()=>null);if(!record||record.used||Date.now()>Number(record.expiresAt||0))return json(400,{error:'Este enlace no es válido o ha caducado.'});const user=await usuarios.lee(record.email);if(!user)return json(400,{error:'Este enlace no es válido.'});user.emailVerifiedAt=new Date().toISOString();await usuarios.escribe(record.email,user);record.used=true;record.usedAt=new Date().toISOString();await store.setJSON(hash,record);return json(200,{ok:true,message:'Email verificado correctamente.'});
 }
 return json(400,{error:'Acción no reconocida.'});
};