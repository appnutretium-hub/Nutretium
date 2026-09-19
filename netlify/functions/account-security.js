'use strict';
const crypto=require('crypto');
const {cabecerasCORS}=require('../lib/cors');
const {getBlobStore}=require('../lib/blob-store');
const {verifyEventSession}=require('../lib/session');
const {hashPassword,verifyPassword:verifyPasswordRecord}=require('../lib/passwords');
const usuarios=require('../lib/usuarios');
const {sendEmail}=require('../lib/email');
const {consume}=require('../lib/rate-limit');
const CORS=cabecerasCORS('POST, OPTIONS');
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL=30*60*1000,VERIFY_TTL=24*60*60*1000,CLAIM_TTL=2*60*1000;
const json=(statusCode,payload,headers={})=>({statusCode,headers:{...CORS,...headers},body:JSON.stringify(payload)});
function validPassword(p){return typeof p==='string'&&p.length>=8&&p.length<=128}
function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex')}
function resetStore(){return getBlobStore('password-resets')}
function verifyStore(){return getBlobStore('email-verifications')}
function publicOrigin(event){const host=String(event.headers?.['x-forwarded-host']||event.headers?.host||'nutretium.com').replace(/[^a-zA-Z0-9.:-]/g,'');return `https://${host||'nutretium.com'}`}
async function authEmail(event){try{return(await verifyEventSession(event)).email}catch{return null}}
function revokedPatch(current,passwordHash){return{...current,...(passwordHash?{passwordHash}:{}),tokensValidAfter:Math.floor(Date.now()/1000),passwordChangedAt:new Date().toISOString()}}

async function claimToken(store,key){
 if(!store||typeof store.getWithMetadata!=='function')return null;
 const now=Date.now(),claimId=crypto.randomUUID();
 for(let i=0;i<10;i++){
  const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'}).catch(()=>null);const record=entry?.data;
  if(!record||record.used||now>Number(record.expiresAt||0))return null;
  if(record.claimId&&now-Number(record.claimedAt||0)<CLAIM_TTL)return null;
  const next={...record,claimId,claimedAt:now};const opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true};
  const write=await store.setJSON(key,next,opts).catch(()=>null);if(write?.modified===true)return{record:next,claimId};
 }
 return null;
}
async function finishClaim(store,key,claimId,used=true){
 for(let i=0;i<10;i++){
  const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'}).catch(()=>null);if(!entry?.data||entry.data.claimId!==claimId)return false;
  const next=used?{...entry.data,used:true,usedAt:new Date().toISOString(),claimId:null,claimedAt:null}:{...entry.data,claimId:null,claimedAt:null};
  const write=await store.setJSON(key,next,{onlyIfMatch:entry.etag}).catch(()=>null);if(write?.modified===true)return true;
 }
 return false;
}

exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}

 if(body.action==='change-password'){
  const email=await authEmail(event);if(!email)return json(401,{error:'Debes iniciar sesión.'});
  const current=String(body.currentPassword||''),next=String(body.newPassword||'');if(!validPassword(next))return json(400,{error:'La nueva contraseña debe tener entre 8 y 128 caracteres.'});
  const rate=await consume({scope:'password-change',event,extra:email,limit:5,windowMs:15*60*1000});if(!rate.allowed)return json(429,{error:'Demasiados intentos. Espera unos minutos.'},{'Retry-After':String(rate.retryAfter||60)});
  const snapshot=await usuarios.lee(email),verification=snapshot?verifyPasswordRecord(current,snapshot.passwordHash):{ok:false};if(!snapshot||!verification.ok)return json(401,{error:'La contraseña actual no es correcta.'});
  const newHash=hashPassword(next);let updated;try{updated=await usuarios.muta(email,u=>{if(u.passwordHash!==snapshot.passwordHash)return null;return revokedPatch(u,newHash)})}catch{return json(409,{error:'La cuenta cambió durante la operación. Vuelve a intentarlo.'})}
  if(!updated||updated.passwordHash!==newHash)return json(409,{error:'La cuenta cambió durante la operación. Vuelve a intentarlo.'});
  return json(200,{ok:true,reauthRequired:true,message:'Contraseña actualizada. Por seguridad, vuelve a iniciar sesión.'});
 }

 if(body.action==='request-reset'){
  const email=String(body.email||'').trim().toLowerCase();if(!EMAIL.test(email))return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
  const rate=await consume({scope:'password-reset-request',event,extra:email,limit:3,windowMs:30*60*1000});if(!rate.allowed)return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
  const user=await usuarios.lee(email);if(!user)return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
  const store=resetStore();if(!store)return json(503,{error:'La recuperación de contraseña no está disponible temporalmente.'});
  const raw=crypto.randomBytes(32).toString('base64url'),record={email,hash:tokenHash(raw),expiresAt:Date.now()+RESET_TTL,used:false,createdAt:new Date().toISOString()};await store.setJSON(record.hash,record);
  const link=`${publicOrigin(event)}/mi-nutretium?reset=${encodeURIComponent(raw)}`;
  await sendEmail({to:email,subject:'Recupera tu contraseña · Nutretium',html:`<p>Has solicitado cambiar la contraseña de tu cuenta Nutretium.</p><p><a href="${link}">Crear una nueva contraseña</a></p><p>El enlace caduca en 30 minutos y solo puede utilizarse una vez.</p>`,idempotencyKey:`nutretium-reset/${record.hash.slice(0,24)}`});
  return json(200,{ok:true,message:'Si existe una cuenta con ese email, recibirás instrucciones.'});
 }

 if(body.action==='reset-password'){
  const raw=String(body.resetToken||''),next=String(body.newPassword||'');if(!raw||!validPassword(next))return json(400,{error:'Enlace o contraseña no válidos.'});
  const rate=await consume({scope:'password-reset-use',event,limit:8,windowMs:30*60*1000});if(!rate.allowed)return json(429,{error:'Demasiados intentos. Espera unos minutos.'},{'Retry-After':String(rate.retryAfter||60)});
  const store=resetStore();if(!store)return json(503,{error:'La recuperación de contraseña no está disponible temporalmente.'});
  const key=tokenHash(raw),claim=await claimToken(store,key);if(!claim)return json(400,{error:'Este enlace no es válido, ya está en uso o ha caducado.'});
  const newHash=hashPassword(next);try{
   const updated=await usuarios.muta(claim.record.email,u=>revokedPatch(u,newHash));
   if(!updated){await finishClaim(store,key,claim.claimId,false);return json(400,{error:'Este enlace no es válido o ha caducado.'})}
  }catch{await finishClaim(store,key,claim.claimId,false);return json(409,{error:'La cuenta cambió durante la operación. Vuelve a intentarlo.'})}
  if(!await finishClaim(store,key,claim.claimId,true))return json(503,{error:'La contraseña se actualizó, pero no se pudo cerrar el enlace de recuperación. Contacta con Nutretium antes de repetir la operación.'});
  return json(200,{ok:true,message:'Contraseña actualizada. Ya puedes iniciar sesión.'});
 }

 if(body.action==='verification-status'){
  const email=await authEmail(event);if(!email)return json(401,{error:'Debes iniciar sesión.'});const user=await usuarios.lee(email);return json(200,{verified:Boolean(user?.emailVerifiedAt),verifiedAt:user?.emailVerifiedAt||null});
 }

 if(body.action==='request-verification'){
  const email=await authEmail(event);if(!email)return json(401,{error:'Debes iniciar sesión.'});const user=await usuarios.lee(email);if(!user)return json(404,{error:'Cuenta no encontrada.'});if(user.emailVerifiedAt)return json(200,{ok:true,verified:true,message:'Tu email ya está verificado.'});
  const rate=await consume({scope:'email-verify-request',event,extra:email,limit:3,windowMs:60*60*1000});if(!rate.allowed)return json(429,{error:'Has solicitado varios enlaces. Espera antes de pedir otro.'},{'Retry-After':String(rate.retryAfter||60)});
  const store=verifyStore();if(!store)return json(503,{error:'La verificación no está disponible temporalmente.'});const raw=crypto.randomBytes(32).toString('base64url'),hash=tokenHash(raw);await store.setJSON(hash,{email,hash,expiresAt:Date.now()+VERIFY_TTL,used:false,createdAt:new Date().toISOString()});const link=`${publicOrigin(event)}/mi-nutretium?verify=${encodeURIComponent(raw)}`;await sendEmail({to:email,subject:'Verifica tu email · Nutretium',html:`<p>Confirma que este email pertenece a tu cuenta Nutretium.</p><p><a href="${link}">Verificar email</a></p><p>El enlace caduca en 24 horas y solo puede utilizarse una vez.</p>`,idempotencyKey:`nutretium-verify/${hash.slice(0,24)}`});return json(200,{ok:true,message:'Te hemos enviado un enlace de verificación si el servicio de correo está disponible.'});
 }

 if(body.action==='verify-email'){
  const raw=String(body.verifyToken||'');if(!raw)return json(400,{error:'Enlace de verificación no válido.'});const store=verifyStore();if(!store)return json(503,{error:'La verificación no está disponible temporalmente.'});
  const hash=tokenHash(raw),claim=await claimToken(store,hash);if(!claim)return json(400,{error:'Este enlace no es válido, ya está en uso o ha caducado.'});
  try{const updated=await usuarios.muta(claim.record.email,u=>({...u,emailVerifiedAt:u.emailVerifiedAt||new Date().toISOString(),updatedAt:new Date().toISOString()}));if(!updated){await finishClaim(store,hash,claim.claimId,false);return json(400,{error:'Este enlace no es válido.'})}}
  catch{await finishClaim(store,hash,claim.claimId,false);return json(409,{error:'La cuenta cambió durante la verificación. Vuelve a intentarlo.'})}
  if(!await finishClaim(store,hash,claim.claimId,true))return json(503,{error:'El email quedó verificado, pero no se pudo cerrar el enlace. Contacta con Nutretium si vuelve a aparecer.'});
  return json(200,{ok:true,message:'Email verificado correctamente.'});
 }
 return json(400,{error:'Acción no reconocida.'});
};
