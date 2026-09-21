'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='financial-ledger-v1';
const TYPES=new Set(['PAYMENT_CAPTURED','PAYMENT_FAILED','PAYMENT_REFUNDED','COMMISSION','GIFTCARD_DEBIT','POINTS_REDEEMED']);
function storeOrThrow(){const s=getBlobStore(STORE);if(!s){const e=new Error('Ledger no disponible.');e.code='LEDGER_UNAVAILABLE';throw e;}return s;}
function canonical(v){if(Array.isArray(v))return`[${v.map(canonical).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;return JSON.stringify(v);}
function digest(entry){return crypto.createHash('sha256').update(canonical(entry)).digest('hex');}
async function append({type,orderId,amountCents,currency='EUR',source='platform',reference='',traceId=''}){if(!TYPES.has(type))throw new TypeError('Tipo de movimiento no permitido.');if(!orderId||!Number.isInteger(amountCents))throw new TypeError('Movimiento financiero inválido.');const s=storeOrThrow(),id=crypto.createHash('sha256').update(`${type}:${orderId}:${reference||'primary'}`).digest('hex'),createdAt=new Date().toISOString(),body={id,type,orderId:String(orderId),amountCents,currency:String(currency),source:String(source),reference:String(reference),traceId:String(traceId),createdAt},entry={...body,integrity:digest(body)};const result=await s.setJSON(`entry/${id}`,entry,{onlyIfNew:true});if(result&&result.modified===false){const existing=await s.get(`entry/${id}`,{type:'json',consistency:'strong'}),same=existing&&existing.type===type&&existing.orderId===String(orderId)&&existing.amountCents===amountCents&&existing.currency===String(currency)&&existing.source===String(source)&&existing.reference===String(reference);if(!same||!(await verify(existing))){const e=new Error('Conflicto de idempotencia en ledger.');e.code='LEDGER_CONFLICT';throw e;}return{...existing,idempotent:true};}return entry;}
async function verify(entry){if(!entry?.integrity)return false;const{integrity,...body}=entry;return digest(body)===integrity;}
module.exports={STORE,TYPES,append,verify,digest};
