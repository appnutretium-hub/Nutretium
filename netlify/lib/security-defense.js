'use strict';

const crypto = require('crypto');
const { getBlobStore } = require('./blob-store');
const security = require('./security-policy');

function header(event, name) {
  const headers = event?.headers || {};
  const wanted = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return String(value || '');
  }
  return '';
}
function expectedOrigins() {
  const values = [process.env.ALLOWED_ORIGIN, process.env.URL, process.env.DEPLOY_PRIME_URL].map(v=>String(v||'').trim()).filter(Boolean);
  const out = new Set();
  for (const value of values) { try { const url=new URL(value); if(url.protocol==='https:'||url.hostname==='localhost'||url.hostname==='127.0.0.1')out.add(url.origin); } catch {} }
  if (security.productionLike()) { out.add('https://nutretium.com'); out.add('https://www.nutretium.com'); }
  if (!out.size) out.add('http://localhost:8888');
  return out;
}
function normalizeOrigin(value){try{return new URL(String(value||'')).origin}catch{return''}}
function requestFingerprint(event){
  const ua=header(event,'user-agent').trim().replace(/\s+/g,' ').slice(0,512),lang=header(event,'accept-language').trim().replace(/\s+/g,' ').slice(0,128),platform=header(event,'sec-ch-ua-platform').trim().slice(0,128);
  return crypto.createHash('sha256').update(`${ua}\n${lang}\n${platform}`).digest('base64url');
}
function assertBrowserBoundary(event){
  if(!security.productionLike()||!security.mutatingMethod(event?.httpMethod))return true;
  const fetchSite=header(event,'sec-fetch-site').toLowerCase();
  if(fetchSite&&!['same-origin','same-site','none'].includes(fetchSite))throw Object.assign(new Error('Solicitud cross-site bloqueada.'),{code:'CROSS_SITE_BLOCKED'});
  const origin=normalizeOrigin(header(event,'origin'));
  if(!origin||!expectedOrigins().has(origin))throw Object.assign(new Error('Origen no autorizado.'),{code:'ORIGIN_BLOCKED'});
  const contentType=header(event,'content-type').toLowerCase();
  if(event?.body&&(!contentType||!contentType.includes('application/json')))throw Object.assign(new Error('Content-Type no permitido.'),{code:'CONTENT_TYPE_BLOCKED'});
  const size=Buffer.byteLength(String(event?.body||''),'utf8');
  if(size>5*1024*1024)throw Object.assign(new Error('Solicitud demasiado grande.'),{code:'BODY_TOO_LARGE'});
  return true;
}
function assertSessionBinding(event,claims){
  if(!security.productionLike())return true;
  if(!claims?.fp)throw Object.assign(new Error('Sesión no ligada al navegador.'),{code:'SESSION_UNBOUND'});
  const actual=requestFingerprint(event),expected=String(claims.fp||''),a=Buffer.from(actual),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Object.assign(new Error('La sesión cambió de contexto.'),{code:'SESSION_CONTEXT_CHANGED'});
  return true;
}
function requestId(event){return header(event,'x-nutretium-request').trim()}
function validRequestId(value){return/^[A-Za-z0-9._:-]{16,128}$/.test(String(value||''))}
async function consumeMutationNonce({event,actor,scope}){
  if(!security.productionLike())return{ok:true,bypassed:true};
  const id=requestId(event);if(!validRequestId(id))return{ok:false,statusCode:400,code:'REQUEST_ID_REQUIRED',error:'Identificador seguro de operación ausente o inválido.'};
  const day=new Date().toISOString().slice(0,10).replace(/-/g,''),store=getBlobStore(`security-replay-${day}`);
  if(!store||typeof store.setJSON!=='function')return{ok:false,statusCode:503,code:'REPLAY_GUARD_UNAVAILABLE',error:'El control anti-replay no está disponible.'};
  const key=crypto.createHash('sha256').update(`${String(actor||'').toLowerCase()}|${String(scope||'')}|${id}`).digest('hex');
  let result;try{result=await store.setJSON(key,{at:new Date().toISOString(),actor:String(actor||'').toLowerCase(),scope:String(scope||'')},{onlyIfNew:true})}catch{return{ok:false,statusCode:503,code:'REPLAY_GUARD_UNAVAILABLE',error:'El control anti-replay no está disponible.'}}
  if(result?.modified!==true)return{ok:false,statusCode:409,code:'REPLAY_BLOCKED',error:'Operación duplicada o repetida bloqueada.'};
  return{ok:true,requestId:id};
}
async function verifyAuditIntegrity(limit=5000){
  const audit=require('./audit-log');let result;try{result=await audit.verify(limit)}catch{result=null}
  if(!result||result.valid!==true)return{ok:false,statusCode:503,code:'AUDIT_INTEGRITY_FAILED',error:'La cadena de auditoría no supera la verificación de integridad. Operación crítica bloqueada.'};
  return{ok:true,checked:Number(result.checked||0),truncated:Boolean(result.truncated)};
}
function newSessionBinding(event){return{sid:security.randomToken(24),fp:requestFingerprint(event),jti:security.randomToken(24)}}
module.exports={header,expectedOrigins,normalizeOrigin,requestFingerprint,assertBrowserBoundary,assertSessionBinding,requestId,validRequestId,consumeMutationNonce,verifyAuditIntegrity,newSessionBinding};
