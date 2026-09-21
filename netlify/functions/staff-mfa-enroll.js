'use strict';
const crypto=require('crypto');
const usuarios=require('../lib/usuarios');
const {getBlobStore}=require('../lib/blob-store');
const {verifyEventSession}=require('../lib/session');
const {verifyPassword}=require('../lib/passwords');
const {effectiveRoleFor}=require('../lib/staff');
const totp=require('../lib/totp');
const {consume}=require('../lib/rate-limit');
const {cabecerasCORS}=require('../lib/cors');
const security=require('../lib/security-policy');
const defense=require('../lib/security-defense');
const audit=require('../lib/audit-log');

const CORS=cabecerasCORS('POST, OPTIONS');
const TTL_MS=10*60*1000;
const ALLOWED_ROLES=new Set(['owner','admin']);
const json=(statusCode,body)=>({statusCode,headers:{...CORS,...security.securityHeaders(),'Cache-Control':'no-store'},body:JSON.stringify(body)});
const keyFor=email=>crypto.createHash('sha256').update(String(email||'').trim().toLowerCase()).digest('hex');
const store=()=>getBlobStore('staff-mfa-enrollment');

async function identity(event){
 let verified;try{verified=await verifyEventSession(event)}catch{return null}
 const email=String(verified?.email||'').trim().toLowerCase();if(!email)return null;
 const role=await effectiveRoleFor(email);if(!ALLOWED_ROLES.has(role))return{email,role,allowed:false};
 return{email,role,allowed:true};
}

exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 try{defense.assertBrowserBoundary(event)}catch(error){return json(403,{error:error.message,code:error.code||'REQUEST_BLOCKED'})}
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 const who=await identity(event);if(!who)return json(401,{error:'Primero inicia sesión en Mi Nutretium con esta misma cuenta.'});
 if(!who.allowed)return json(403,{error:'Esta cuenta no está configurada como propietario o administrador.'});
 const bucket=await consume({scope:'staff-mfa-enroll',event,extra:who.email,limit:8,windowMs:15*60*1000});
 if(!bucket.allowed)return json(429,{error:'Demasiados intentos. Espera unos minutos.'});
 const user=await usuarios.lee(who.email);if(!user)return json(404,{error:'La cuenta de usuario no existe todavía.'});
 const s=store();if(!s)return json(503,{error:'El servicio de alta MFA no está disponible temporalmente.'});

 if(body.action==='start'){
  const password=String(body.password||'');
  if(!verifyPassword(password,user.passwordHash).ok)return json(401,{error:'La contraseña no es correcta.'});
  const secret=totp.generateSecret(),record={email:who.email,role:who.role,secretEncrypted:totp.sealSecret(secret),expiresAt:Date.now()+TTL_MS,createdAt:new Date().toISOString(),used:false};
  await s.setJSON(keyFor(who.email),record);
  await audit.append({event,actor:who.email,action:'STAFF_MFA_ENROLLMENT_STARTED',resource:who.email,outcome:'SUCCESS',metadata:{role:who.role,expiresMinutes:10}}).catch(()=>null);
  return json(200,{ok:true,email:who.email,role:who.role,secret,provisioningUri:totp.provisioningUri(who.email,secret),expiresInSeconds:600,message:'Añade esta clave a tu aplicación Authenticator y confirma con un código de 6 dígitos.'});
 }

 if(body.action==='confirm'){
  const entry=await s.get(keyFor(who.email),{type:'json',consistency:'strong'}).catch(()=>null);
  if(!entry||entry.used||Date.now()>Number(entry.expiresAt||0))return json(400,{error:'La configuración ha caducado. Empieza de nuevo.'});
  let secret;try{secret=totp.openSecret(entry.secretEncrypted)}catch{return json(503,{error:'No se pudo abrir la configuración MFA.'})}
  const code=String(body.code||'').replace(/\s/g,'');if(!totp.verify(secret,code))return json(400,{error:'El código de 6 dígitos no es correcto. Comprueba la hora del móvil e inténtalo de nuevo.'});
  const encrypted=totp.sealSecret(secret),at=new Date().toISOString();
  const updated=await usuarios.muta(who.email,current=>({...current,mfaEnabled:true,mfaSecretEncrypted:encrypted,mfaEnrolledAt:at,sessionVersion:Number(current.sessionVersion||0)+1,updatedAt:at}));
  if(!updated)return json(404,{error:'La cuenta ya no existe.'});
  await s.setJSON(keyFor(who.email),{email:who.email,role:who.role,used:true,usedAt:at,expiresAt:Number(entry.expiresAt||0)}).catch(()=>{});
  await audit.append({event,actor:who.email,action:'STAFF_MFA_ENROLLMENT_COMPLETED',resource:who.email,outcome:'SUCCESS',metadata:{role:who.role}}).catch(()=>null);
  return json(200,{ok:true,reauthRequired:true,message:'MFA activado correctamente. Vuelve a Enterprise e inicia sesión con contraseña y el código de Authenticator.'});
 }
 return json(400,{error:'Acción no reconocida.'});
};

exports._test={keyFor,TTL_MS,ALLOWED_ROLES};
