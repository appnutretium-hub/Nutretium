/**
 * netlify/functions/pago-return.js — NUTRETIUM
 * Valida la vuelta firmada del navegador y solo expone un estado cuando la
 * respuesta coincide con el pedido creado por el servidor.
 */
'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('../lib/blob-store');
function deriveSigningKey(secretKeyBase64,orderNumber){const keyBuffer=Buffer.from(secretKeyBase64,'base64'),iv=Buffer.alloc(8,0),cipher=crypto.createCipheriv('des-ede3-cbc',keyBuffer,iv);cipher.setAutoPadding(false);const orderBuffer=Buffer.alloc(Math.ceil(orderNumber.length/8)*8,0);orderBuffer.write(orderNumber,'utf8');return Buffer.concat([cipher.update(orderBuffer),cipher.final()])}
function toBase64Url(b64){return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function safeEqual(a,b){const ba=Buffer.from(String(a)),bb=Buffer.from(String(b));return ba.length===bb.length&&crypto.timingSafeEqual(ba,bb)}
function parseForm(event){const raw=event.body||'',decoded=event.isBase64Encoded?Buffer.from(raw,'base64').toString('utf8'):raw,p=new URLSearchParams(decoded);return{merchantParameters:p.get('Ds_MerchantParameters'),signature:p.get('Ds_Signature')}}
async function verifyReturn(event){
 try{
  const{merchantParameters,signature}=parseForm(event);if(!merchantParameters||!signature)return{order:null,estado:null};
  const json=JSON.parse(Buffer.from(merchantParameters,'base64').toString('utf8')),order=json.Ds_Order||json.DS_ORDER||null;if(!order||!/^[0-9A-Za-z]{4,12}$/.test(order))return{order:null,estado:null};
  const secret=process.env.REDSYS_SECRET_KEY;if(!secret)return{order,estado:null};
  const computed=crypto.createHmac('sha256',deriveSigningKey(secret,order)).update(merchantParameters).digest('base64');if(!safeEqual(toBase64Url(computed),toBase64Url(signature))){console.warn('[pago-return] Firma inválida en la vuelta del pedido',order);return{order,estado:null}}
  const store=getBlobStore('redsys-orders');if(!store)return{order,estado:null};
  const record=await store.get(order,{type:'json',consistency:'strong'}).catch(()=>null);if(!record)return{order,estado:null};
  const expected=Math.round(Number(record.amount||0)*100),received=Number(json.Ds_Amount||json.DS_AMOUNT),currency=String(json.Ds_Currency||json.DS_CURRENCY||'');
  if(!Number.isFinite(expected)||expected<=0||!Number.isFinite(received)||expected!==received||currency!=='978'){console.error('[pago-return] Respuesta firmada no conciliada',order,{expected,received,currency});return{order,estado:null}}
  if(record.amountMismatch||record.fulfilmentStatus==='REVIEW_REQUIRED')return{order,estado:null};
  const code=parseInt(json.Ds_Response,10),estado=Number.isInteger(code)&&code>=0&&code<=99?'PAID':'FAILED';console.log('[pago-return]',JSON.stringify({order,estado,code:json.Ds_Response}));return{order,estado};
 }catch(err){console.error('[pago-return] Error procesando la vuelta:',err);return{order:null,estado:null}}
}
exports.handler=async function(event){
 const verified=await verifyReturn(event),result=verified.estado==='PAID'?'ok':verified.estado==='FAILED'?'ko':'pending',params=new URLSearchParams({pago:result});
 if(verified.order)params.set('order',verified.order);if(verified.estado)params.set('estado',verified.estado);
 return{statusCode:303,headers:{Location:`/?${params.toString()}`,'Cache-Control':'no-store'},body:''};
};
exports._test={deriveSigningKey,toBase64Url,safeEqual,parseForm,verifyReturn};