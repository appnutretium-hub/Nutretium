'use strict';

const crypto=require('crypto');

const MAX={kind:48,message:500,path:220,actionId:160,source:120,method:12,url:300};
const PROTECTED_TERMS=/\b(?:checkout|pago|payment|redsys|refund|reembolso|delete|borrar|remove-account|password|contrase(?:n|ñ)a|mfa|totp|admin|staff|permission|role|secret|token|dns|migration|migraci(?:o|ó)n|order-finalize|pedido-final)\b/i;
const RETRYABLE_METHODS=new Set(['GET','HEAD']);
const HIGH_SIGNAL_KINDS=new Set(['error','promise','network_5xx','resource_error','contract_failure']);

function clean(value,max=200){return String(value??'').replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function normalizePath(value){
 const raw=clean(value,MAX.path)||'/';
 try{const u=new URL(raw,'https://nutretium.com');return `${u.pathname}${u.search}`.slice(0,MAX.path)}catch{return raw.startsWith('/')?raw:`/${raw}`}
}
function normalizeMethod(value){const m=clean(value,MAX.method).toUpperCase();return /^[A-Z]+$/.test(m)?m:''}
function sanitizeIncident(input={}){
 const extra=input.extra&&typeof input.extra==='object'?input.extra:{};
 return{
  kind:clean(input.kind,MAX.kind).toLowerCase(),
  message:clean(input.message,MAX.message),
  path:normalizePath(input.path),
  actionId:clean(input.actionId||extra.actionId,MAX.actionId),
  source:clean(input.source||extra.source,MAX.source),
  method:normalizeMethod(input.method||extra.method),
  url:clean(input.url||extra.url,MAX.url),
  status:Number.isFinite(Number(input.status??extra.status))?Number(input.status??extra.status):null,
  contract:clean(input.contract||extra.contract,80),
  recovery:clean(input.recovery||extra.recovery,80),
  createdAt:clean(input.createdAt,40)||new Date().toISOString()
 };
}
function fingerprint(input={}){
 const i=sanitizeIncident(input);
 return crypto.createHash('sha256').update([i.kind,i.path,i.actionId,i.source,i.method,i.status??'',i.message.slice(0,180)].join('|')).digest('hex').slice(0,32);
}
function isProtected(input={}){
 const i=sanitizeIncident(input);
 return PROTECTED_TERMS.test([i.path,i.actionId,i.source,i.url,i.message].join(' '));
}
function classify(input={}){
 const i=sanitizeIncident(input),protectedArea=isProtected(i);
 const serverFailure=i.kind==='network_5xx'||(i.status!==null&&i.status>=500);
 const runtimeFailure=['error','promise','resource_error'].includes(i.kind);
 const functionalFailure=['functional_failure','contract_failure'].includes(i.kind);
 const retryableNetwork=serverFailure&&RETRYABLE_METHODS.has(i.method||'GET')&&!protectedArea;
 const highSignal=HIGH_SIGNAL_KINDS.has(i.kind)||serverFailure;
 return{
  protectedArea,serverFailure,runtimeFailure,functionalFailure,retryableNetwork,highSignal,
  severity:protectedArea&&highSignal?'critical':highSignal?'error':functionalFailure?'warning':'info',
  canImmediateRetry:retryableNetwork,
  canRuntimeRecover:!protectedArea&&(runtimeFailure||functionalFailure||retryableNetwork),
  canAutoPatch:false,
  requiresCodeReview:true
 };
}
function safeDispatchPayload(input={}){const incident=sanitizeIncident(input);return{fingerprint:fingerprint(incident),incident,policy:classify(incident)}}

module.exports={MAX,PROTECTED_TERMS,RETRYABLE_METHODS,HIGH_SIGNAL_KINDS,clean,normalizePath,normalizeMethod,sanitizeIncident,fingerprint,isProtected,classify,safeDispatchPayload};
