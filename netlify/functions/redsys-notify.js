/**
 * netlify/functions/redsys-notify.js — NUTRETIUM
 * Fuente de verdad del pago: notificación servidor-a-servidor firmada por Redsys.
 */
'use strict';

const crypto = require('crypto');
const { getBlobStore } = require('../lib/blob-store');
const inventory = require('../lib/inventory');
const finalize = require('../lib/order-finalize');
const paymentConfig = require('../lib/payment-config');
const { sendEmail, buildStoreOrderEmail, buildCustomerOrderEmail } = require('../lib/email');

const HEADERS = { 'Content-Type':'text/plain; charset=utf-8' };

async function getStore(){ return getBlobStore('redsys-orders'); }
function isEnterpriseOrder(record){return Array.isArray(record?.reservations)}

function deriveSigningKey(secretKeyBase64, orderNumber){
  const keyBuffer = Buffer.from(secretKeyBase64,'base64');
  const iv = Buffer.alloc(8,0);
  const cipher = crypto.createCipheriv('des-ede3-cbc',keyBuffer,iv);
  cipher.setAutoPadding(false);
  const orderBuffer = Buffer.alloc(Math.ceil(orderNumber.length/8)*8,0);
  orderBuffer.write(orderNumber,'utf8');
  return Buffer.concat([cipher.update(orderBuffer),cipher.final()]);
}
function hmacBase64(dataBase64, signingKey){return crypto.createHmac('sha256',signingKey).update(dataBase64).digest('base64')}
function toBase64Url(b64){return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function safeEqual(a,b){const ba=Buffer.from(String(a)),bb=Buffer.from(String(b));return ba.length===bb.length&&crypto.timingSafeEqual(ba,bb)}
function parseBody(event){const headers=event.headers||{},ct=(headers['content-type']||headers['Content-Type']||'').toLowerCase(),raw=event.body||'';if(ct.includes('application/json'))return JSON.parse(raw);const p=new URLSearchParams(raw);return{Ds_SignatureVersion:p.get('Ds_SignatureVersion'),Ds_MerchantParameters:p.get('Ds_MerchantParameters'),Ds_Signature:p.get('Ds_Signature')}}
async function sendOrderEmails(record){const results={store:false,customer:false};if(record.missingOrderRecord)return results;try{const storeMail=buildStoreOrderEmail(record),r=await sendEmail({to:process.env.ORDER_NOTIFICATION_EMAIL,subject:storeMail.subject,html:storeMail.html,idempotencyKey:`nutretium-order-store/${record.order}`});results.store=Boolean(r?.ok)}catch(err){console.error('[Redsys-notify] Email tienda:',err)}if(record.email&&!record.amountMismatch&&!record.missingOrderRecord){try{const customerMail=buildCustomerOrderEmail(record),r=await sendEmail({to:record.email,subject:customerMail.subject,html:customerMail.html,idempotencyKey:`nutretium-order-customer/${record.order}`});results.customer=Boolean(r?.ok)}catch(err){console.error('[Redsys-notify] Email cliente:',err)}}return results}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:HEADERS,body:''};if(event.httpMethod!=='POST')return{statusCode:405,headers:HEADERS,body:'Method Not Allowed'};
 const payment=await paymentConfig.resolve().catch(()=>null),secretKey=payment?.secretKey;if(!payment?.enabled||!secretKey){console.error('[Redsys-notify] Redsys no configurado');return{statusCode:500,headers:HEADERS,body:'Server misconfigured'}}
 if(payment.managed&&payment.environment==='production'&&payment.dedicatedVaultKey!==true){console.error('[Redsys-notify] Falta CONFIG_VAULT_KEY dedicada');return{statusCode:500,headers:HEADERS,body:'Server misconfigured'}}
 let data;try{data=parseBody(event)}catch{return{statusCode:400,headers:HEADERS,body:'Bad body'}}const{Ds_MerchantParameters,Ds_Signature}=data;if(!Ds_MerchantParameters||!Ds_Signature)return{statusCode:400,headers:HEADERS,body:'Missing parameters'};
 let params;try{params=JSON.parse(Buffer.from(Ds_MerchantParameters,'base64').toString('utf8'))}catch{return{statusCode:400,headers:HEADERS,body:'Invalid parameters'}}const order=params.Ds_Order||params.DS_ORDER;if(!order)return{statusCode:400,headers:HEADERS,body:'Missing order'};
 let computed;try{computed=toBase64Url(hmacBase64(Ds_MerchantParameters,deriveSigningKey(secretKey,order)))}catch(err){console.error('[Redsys-notify] Error firma:',err);return{statusCode:500,headers:HEADERS,body:'Signature error'}}if(!safeEqual(computed,toBase64Url(Ds_Signature))){console.warn('[Redsys-notify] FIRMA INVÁLIDA',order);return{statusCode:403,headers:HEADERS,body:'Invalid signature'}}
 const transactionType=String(params.Ds_TransactionType??params.DS_TRANSACTIONTYPE??'');if(transactionType!=='0'){console.warn('[Redsys-notify] Tipo de operación ajeno al cobro inicial; se ignora sin mutar el pedido',order,transactionType||'(vacío)');return{statusCode:200,headers:HEADERS,body:'OK'}}
 const responseCode=parseInt(params.Ds_Response,10),authorised=Number.isInteger(responseCode)&&responseCode>=0&&responseCode<=99,bankAmount=Number(params.Ds_Amount)/100,bankCurrency=params.Ds_Currency;
 const resultado={order,bankAmount,bankCurrency,responseCode:params.Ds_Response,authCode:params.Ds_AuthorisationCode||null,paymentType:params.Ds_PayMethod||null,status:authorised?'PAID':'FAILED',fulfilmentStatus:authorised?'PENDING_FULFILMENT':null,receivedAt:new Date().toISOString()};
 const store=await getStore();if(!store){console.error('[Redsys-notify] Store redsys-orders no disponible',order);return{statusCode:503,headers:HEADERS,body:'Storage unavailable'}}
 let record;try{const previo=await store.get(order,{type:'json'}).catch(()=>null);if(previo?.status==='PAID'&&!authorised){console.warn('[Redsys-notify] Se ignora intento de degradar un pago ya confirmado',order,params.Ds_Response);return{statusCode:200,headers:HEADERS,body:'OK'}}if(!previo){record={...resultado,amount:bankAmount,currency:bankCurrency,missingOrderRecord:true,fulfilmentStatus:authorised?'REVIEW_REQUIRED':null};await store.setJSON(order,record);console.error('[Redsys-notify] PEDIDO PREVIO AUSENTE',order)}else{
   const esperadoCents=Math.round(Number(previo.amount)*100),cobradoCents=parseInt(params.Ds_Amount,10);
   record={...previo,...resultado,amount:previo.amount,currency:previo.currency||bankCurrency,bankAmount,bankCurrency};
   if(!Number.isFinite(esperadoCents)||esperadoCents<=0){record.amountMismatch={esperado:null,cobrado:cobradoCents/100,motivo:'importe esperado no válido'};record.fulfilmentStatus='REVIEW_REQUIRED'}else if(esperadoCents!==cobradoCents){record.amountMismatch={esperado:esperadoCents/100,cobrado:cobradoCents/100};record.fulfilmentStatus='REVIEW_REQUIRED';console.error('[Redsys-notify] IMPORTE DISTINTO',order,esperadoCents,cobradoCents)}else{delete record.amountMismatch;if(authorised)record.fulfilmentStatus='PENDING_FULFILMENT'}await store.setJSON(order,record)}}catch(err){console.error('[Redsys-notify] No se pudo persistir',order,err);return{statusCode:503,headers:HEADERS,body:'Persistence failed'}}
 if(record.amountMismatch&&!record.missingOrderRecord){record.fulfilmentStatus='REVIEW_REQUIRED';record.inventoryReservation={...(record.inventoryReservation||{}),status:'HELD_REVIEW',reviewAt:new Date().toISOString(),error:null};record.paymentReview={reason:'AMOUNT_MISMATCH',held:true,at:new Date().toISOString()};try{await store.setJSON(order,record)}catch(err){console.error('[Redsys-notify] No se pudo guardar revisión por importe',order,err);return{statusCode:503,headers:HEADERS,body:'Persistence failed'}}console.error('[Redsys-notify] Pago firmado con importe discrepante; reserva retenida y fulfillment bloqueado',order);return{statusCode:200,headers:HEADERS,body:'OK'}}
 if(!record.missingOrderRecord&&Array.isArray(record.items)){if(isEnterpriseOrder(record)){try{if(authorised){await finalize.finalizePaid(record,{source:'redsys',sendCustomerEmail:false});record.enterpriseFinalization={status:'FINALIZED',at:new Date().toISOString()}}else{await finalize.finalizeFailed(record);record.enterpriseFinalization={status:'RELEASED',at:new Date().toISOString()}}}catch(err){record.fulfilmentStatus='REVIEW_REQUIRED';record.enterpriseFinalization={status:'FAILED',error:String(err.message||err).slice(0,240),at:new Date().toISOString()};try{await store.setJSON(order,record)}catch{}console.error('[Redsys-notify] Finalización Enterprise fallida',order,err);return{statusCode:503,headers:HEADERS,body:'Enterprise finalization failed'}}}else if(authorised){const inv=await inventory.commit(order,record.items);if(!inv.ok){record.fulfilmentStatus='REVIEW_REQUIRED';record.inventoryReservation={...(record.inventoryReservation||{}),status:'COMMIT_FAILED',error:inv.error,updatedAt:new Date().toISOString()};try{await store.setJSON(order,record)}catch{}console.error('[Redsys-notify] No se pudo confirmar inventario',order,inv.error);return{statusCode:503,headers:HEADERS,body:'Inventory commit failed'}}record.inventoryReservation={...(record.inventoryReservation||{}),status:'COMMITTED',committedAt:new Date().toISOString()}}else{const inv=await inventory.release(order,record.items);record.inventoryReservation={...(record.inventoryReservation||{}),status:inv.ok?'RELEASED':'RELEASE_PENDING',releasedAt:inv.ok?new Date().toISOString():null,error:inv.ok?null:inv.error}}try{await store.setJSON(order,record)}catch(err){console.error('[Redsys-notify] No se pudo guardar estado de finalización',order,err);return{statusCode:503,headers:HEADERS,body:'Persistence failed'}}}
 if(authorised&&!record.missingOrderRecord){const emailResults=await sendOrderEmails(record);record.emailNotifications={...(record.emailNotifications||{}),storeSent:Boolean(emailResults.store),customerSent:Boolean(emailResults.customer),attemptedAt:new Date().toISOString()};try{await store.setJSON(order,record)}catch(err){console.error('[Redsys-notify] No se pudo guardar estado de emails',order,err);return{statusCode:503,headers:HEADERS,body:'Persistence failed'}}}
 console.log('[Redsys-notify]',JSON.stringify({order,status:record.status,fulfilmentStatus:record.fulfilmentStatus,inventoryStatus:record.inventoryReservation?.status||null,enterpriseFinalization:record.enterpriseFinalization?.status||null,missingOrderRecord:Boolean(record.missingOrderRecord),emailNotifications:record.emailNotifications||null}));return{statusCode:200,headers:HEADERS,body:'OK'};
};
exports._test={isEnterpriseOrder};
