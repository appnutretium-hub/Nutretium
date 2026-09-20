'use strict';
const crypto=require('crypto');
const {requireStaff}=require('../lib/staff');
const {getBlobStore}=require('../lib/blob-store');
const enterprise=require('../lib/enterprise-store');
const {withLock}=require('../lib/distributed-lock');
const paymentConfig=require('../lib/payment-config');
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('POST, OPTIONS'),URLS={test:'https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST',production:'https://sis.redsys.es/sis/rest/trataPeticionREST'},SYSTEM={email:'system@nutretium.local',role:'system'};
const resp=(s,b)=>({statusCode:s,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(b)});
function signingKey(secret,order){const key=Buffer.from(secret,'base64'),iv=Buffer.alloc(8,0),cipher=crypto.createCipheriv('des-ede3-cbc',key,iv);cipher.setAutoPadding(false);const buf=Buffer.alloc(Math.ceil(order.length/8)*8,0);buf.write(order,'utf8');return Buffer.concat([cipher.update(buf),cipher.final()]);}
function sign(params,secret,order){return crypto.createHmac('sha256',signingKey(secret,order)).update(params).digest('base64');}
function decodeParameters(v){try{return JSON.parse(Buffer.from(v,'base64').toString('utf8'))}catch{return null}}
function normalizeSignature(v){return String(v||'').replace(/-/g,'+').replace(/_/g,'/').replace(/=+$/,'')}
function safeSignatureEqual(a,b){const x=Buffer.from(normalizeSignature(a)),y=Buffer.from(normalizeSignature(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function field(obj,...names){for(const name of names)if(obj&&obj[name]!==undefined&&obj[name]!==null)return obj[name];return undefined}
function verifyRefundResponse(data,{secret,orderId,amountCents,merchant,terminal}){
 const params=field(data,'Ds_MerchantParameters','DS_MERCHANTPARAMETERS'),signature=field(data,'Ds_Signature','DS_SIGNATURE'),version=field(data,'Ds_SignatureVersion','DS_SIGNATUREVERSION');
 if(!params||!signature)return{ok:false,error:'Respuesta Redsys sin firma verificable.'};
 if(version&&String(version)!=='HMAC_SHA256_V1')return{ok:false,error:'Versión de firma Redsys no esperada.'};
 const expected=sign(String(params),secret,orderId);if(!safeSignatureEqual(signature,expected))return{ok:false,error:'Firma de respuesta Redsys inválida.'};
 const decoded=decodeParameters(params);if(!decoded)return{ok:false,error:'Parámetros de respuesta Redsys no válidos.'};
 const code=String(field(decoded,'Ds_Response','DS_RESPONSE')||'');
 const order=String(field(decoded,'Ds_Order','DS_ORDER')||'');
 const amount=Number(field(decoded,'Ds_Amount','DS_AMOUNT'));
 const currency=String(field(decoded,'Ds_Currency','DS_CURRENCY')||'');
 const tx=String(field(decoded,'Ds_TransactionType','DS_TRANSACTIONTYPE')||'');
 const responseMerchant=String(field(decoded,'Ds_MerchantCode','DS_MERCHANTCODE')||'');
 const responseTerminal=String(field(decoded,'Ds_Terminal','DS_TERMINAL')||'');
 if(order!==String(orderId))return{ok:false,error:'Redsys devolvió otro número de pedido.',decoded,code};
 if(!Number.isFinite(amount)||amount!==Number(amountCents))return{ok:false,error:'Redsys devolvió un importe distinto.',decoded,code};
 if(currency!=='978')return{ok:false,error:'Redsys devolvió otra moneda.',decoded,code};
 if(tx!=='3')return{ok:false,error:'Redsys devolvió otro tipo de operación.',decoded,code};
 if(responseMerchant&&responseMerchant!==String(merchant))return{ok:false,error:'Redsys devolvió otro comercio.',decoded,code};
 if(responseTerminal&&responseTerminal!==String(terminal))return{ok:false,error:'Redsys devolvió otro terminal.',decoded,code};
 if(code!=='0900')return{ok:false,error:'Redsys no confirmó la devolución.',decoded,code};
 return{ok:true,decoded,code};
}
async function incident(orderId,amountCents,details={}){await enterprise.save('system-incidents',{title:`Reembolso Redsys fallido ${orderId}`,severity:'high',status:'open',orderId,amountCents,...details},SYSTEM,{reason:'refund-failure'}).catch(()=>{})}
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return resp(405,{error:'Method Not Allowed'});
 const auth=await requireStaff(event,'returns.manage');if(!auth.ok)return resp(auth.statusCode,{error:auth.error});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return resp(400,{error:'JSON no válido.'})}
 const orderId=String(body.orderId||''),amountCents=Number(body.amountCents);if(!orderId||!Number.isInteger(amountCents)||amountCents<=0)return resp(400,{error:'Pedido e importe en céntimos son obligatorios.'});
 await paymentConfig.applyRuntime().catch(()=>{});
 const secret=process.env.REDSYS_SECRET_KEY,merchant=process.env.REDSYS_MERCHANT_CODE,terminal=process.env.REDSYS_TERMINAL||'1',env=process.env.REDSYS_ENV||'test';if(!secret||!merchant)return resp(503,{error:'Redsys no está configurado.'});
 const orders=getBlobStore('redsys-orders');if(!orders)return resp(503,{error:'Pedidos no disponibles.'});
 try{return await withLock(`refund:${orderId}`,async()=>{
  const order=await orders.get(orderId,{type:'json',consistency:'strong'}).catch(()=>null);if(!order||order.status!=='PAID'||order.amountMismatch)return resp(409,{error:'El pedido no es reembolsable automáticamente.'});
  const paid=Math.round(Number(order.amount||0)*100),refunded=Number(order.refundedCents||0);if(amountCents>paid-refunded)return resp(409,{error:'El reembolso supera el saldo reembolsable.'});
  const mp={DS_MERCHANT_AMOUNT:String(amountCents),DS_MERCHANT_ORDER:orderId,DS_MERCHANT_MERCHANTCODE:merchant,DS_MERCHANT_CURRENCY:'978',DS_MERCHANT_TRANSACTIONTYPE:'3',DS_MERCHANT_TERMINAL:terminal},params=Buffer.from(JSON.stringify(mp)).toString('base64'),payload={Ds_SignatureVersion:'HMAC_SHA256_V1',Ds_MerchantParameters:params,Ds_Signature:sign(params,secret,orderId)};
  let r,data;try{r=await fetch(URLS[env]||URLS.test,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});data=await r.json().catch(()=>({}))}catch(err){await incident(orderId,amountCents,{error:'network',details:String(err.message||err).slice(0,240)});return resp(502,{error:'No se pudo conectar con Redsys.'})}
  const checked=verifyRefundResponse(data,{secret,orderId,amountCents,merchant,terminal});
  if(!r.ok||!checked.ok){await incident(orderId,amountCents,{responseCode:checked.code||null,error:checked.error||`HTTP ${r.status}`});return resp(502,{error:checked.error||'Redsys no confirmó la devolución.',responseCode:checked.code||null})}
  const decoded=checked.decoded,code=checked.code,nextRefunded=refunded+amountCents,refund={id:crypto.randomUUID(),at:new Date().toISOString(),amountCents,by:auth.email,responseCode:code,authorisationCode:field(decoded,'Ds_AuthorisationCode','DS_AUTHORISATIONCODE')||null};
  const updated={...order,refundedCents:nextRefunded,refunds:[...(order.refunds||[]),refund],refundStatus:nextRefunded===paid?'REFUNDED':'PARTIALLY_REFUNDED'};
  try{await orders.setJSON(orderId,updated)}catch(err){await incident(orderId,amountCents,{error:'bank-success-persistence-failed',refundId:refund.id,details:String(err.message||err).slice(0,240)});return resp(503,{error:'Redsys confirmó la devolución, pero no se pudo registrar localmente. No repitas la operación; requiere conciliación manual.',refundReference:refund.id})}
  const invoiceId=`refund:${orderId}:${refund.id}`;await enterprise.save('invoices',{id:invoiceId,orderId,customerEmail:order.email||'',currency:'EUR',status:'issued',type:'credit_note',amountCents:-amountCents,issuedAt:new Date().toISOString(),reference:refund.id},auth,{id:invoiceId,reason:'redsys-refund'}).catch(()=>{});
  return resp(200,{ok:true,orderId,refundedCents:nextRefunded,remainingCents:paid-nextRefunded,refund});
 },{ttlMs:3*60*1000})}catch(err){if(err.code==='LOCK_BUSY')return resp(409,{error:'Ya hay otro reembolso en curso para este pedido.'});if(err.code==='LOCK_UNAVAILABLE')return resp(503,{error:'No se puede garantizar la exclusión del reembolso ahora mismo.'});console.error('[refund-redsys]',err);return resp(500,{error:'No se pudo completar la devolución.'})}
};
exports._test={signingKey,sign,decodeParameters,normalizeSignature,safeSignatureEqual,verifyRefundResponse};
