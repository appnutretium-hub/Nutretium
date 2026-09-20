'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('../lib/blob-store');
const usuarios=require('../lib/usuarios');
const {hashPassword}=require('../lib/passwords');
const {sendEmail}=require('../lib/email');
const {cabecerasCORS}=require('../lib/cors');
const {consume}=require('../lib/rate-limit');
const CORS=cabecerasCORS('POST, OPTIONS');
const response=(s,b,h={})=>({statusCode:s,headers:{...CORS,'Cache-Control':'no-store',...h},body:JSON.stringify(b)});
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLAIM_TTL=2*60*1000;
function digest(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}
async function claimToken(store,key){
 const now=Date.now(),claimId=crypto.randomUUID();
 if(!store||typeof store.getWithMetadata!=='function')return null;
 for(let i=0;i<10;i++){
  const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'}).catch(()=>null),record=entry?.data;
  if(!record||record.used||Number(record.expiresAt)<now)return null;
  if(record.claimId&&now-Number(record.claimedAt||0)<CLAIM_TTL)return null;
  const next={...record,claimId,claimedAt:now},opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true};
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
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'JSON no válido.'})}
 const store=getBlobStore('password-reset-v1');if(!store||typeof store.getWithMetadata!=='function')return response(503,{error:'Recuperación de contraseña no disponible.'});
 if(body.action==='request'){
  const email=String(body.email||'').trim().toLowerCase();if(!EMAIL.test(email))return response(200,{ok:true});
  const rate=await consume({scope:'password-reset-legacy-request',event,extra:email,limit:3,windowMs:30*60*1000}).catch(()=>({allowed:false,degraded:true,retryAfter:60}));
  if(!rate.allowed)return rate.degraded?response(503,{error:'El control de seguridad no está disponible temporalmente.'},{'Retry-After':String(rate.retryAfter||60)}):response(200,{ok:true});
  if(!process.env.RESEND_API_KEY||!String(process.env.ORDER_EMAIL_FROM||'').trim())return response(503,{error:'El correo de recuperación no está configurado.'});
  const user=await usuarios.lee(email);if(!user)return response(200,{ok:true});
  const raw=crypto.randomBytes(32).toString('base64url'),id=digest(raw),expiresAt=Date.now()+30*60*1000;
  const write=await store.setJSON(id,{email,expiresAt,used:false,createdAt:new Date().toISOString()},{onlyIfNew:true}).catch(()=>null);if(!write?.modified)return response(503,{error:'No se pudo preparar el enlace de recuperación.'});
  const base=String(process.env.PUBLIC_SITE_URL||'https://nutretium.com').replace(/\/$/,''),link=`${base}/?reset=${encodeURIComponent(raw)}`;
  const mail=await sendEmail({to:email,subject:'Restablecer contraseña de Nutretium',html:`<p>Se ha solicitado cambiar la contraseña de tu cuenta Nutretium.</p><p><a href="${link}">Restablecer contraseña</a></p><p>El enlace caduca en 30 minutos y solo puede usarse una vez.</p>`,idempotencyKey:`nutretium-reset-legacy/${id.slice(0,24)}`});
  if(!mail?.ok){await store.delete(id).catch(()=>{});return response(503,{error:'No se pudo enviar el correo de recuperación.'})}
  return response(200,{ok:true});
 }
 if(body.action==='reset'){
  const raw=String(body.token||''),newPassword=String(body.newPassword||'');if(raw.length<30||newPassword.length<10||newPassword.length>128)return response(400,{error:'Token o contraseña no válidos.'});
  const rate=await consume({scope:'password-reset-legacy-use',event,limit:8,windowMs:30*60*1000}).catch(()=>({allowed:false,degraded:true,retryAfter:60}));if(!rate.allowed)return response(rate.degraded?503:429,{error:rate.degraded?'El control de seguridad no está disponible temporalmente.':'Demasiados intentos. Espera unos minutos.'},{'Retry-After':String(rate.retryAfter||60)});
  const id=digest(raw),claim=await claimToken(store,id);if(!claim)return response(400,{error:'El enlace ha caducado, ya fue utilizado o está en uso.'});
  const changedAt=new Date().toISOString(),passwordHash=hashPassword(newPassword),validAfter=Math.floor(Date.now()/1000);
  let updated;try{updated=await usuarios.muta(claim.record.email,user=>({...user,passwordHash,passwordChangedAt:changedAt,tokensValidAfter:validAfter,sessionVersion:Number(user.sessionVersion||0)+1,updatedAt:changedAt}))}catch{await finishClaim(store,id,claim.claimId,false);return response(409,{error:'La cuenta cambió durante la operación. Vuelve a intentarlo.'})}
  if(!updated){await finishClaim(store,id,claim.claimId,false);return response(400,{error:'El enlace ya no es válido.'})}
  if(!await finishClaim(store,id,claim.claimId,true))return response(503,{error:'La contraseña se actualizó, pero no se pudo cerrar el enlace. Contacta con Nutretium antes de repetir.'});
  return response(200,{ok:true,reauthRequired:true});
 }
 return response(400,{error:'Acción no reconocida.'});
};
exports._test={digest,passwordHash:hashPassword,claimToken,finishClaim};