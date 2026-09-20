'use strict';
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
globalThis.__NUTRETIUM_TEST_BLOBS__=new Map();
globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map();
const refund=require('../netlify/functions/refund-redsys')._test;
const lock=require('../netlify/lib/distributed-lock');
const {getBlobStore}=require('../netlify/lib/blob-store');
const notify=require('../netlify/functions/redsys-notify');
const status=require('../netlify/functions/redsys-status');
const pagoReturn=require('../netlify/functions/pago-return');
const secret=Buffer.alloc(24,7).toString('base64'),orderId='0920ABC12345',amountCents=145,merchant='999008881',terminal='1';
process.env.REDSYS_SECRET_KEY=secret;
function signedResponse(overrides={}){const params=Buffer.from(JSON.stringify({Ds_Amount:String(amountCents),Ds_Currency:'978',Ds_Order:orderId,Ds_MerchantCode:merchant,Ds_Terminal:terminal,Ds_Response:'0900',Ds_TransactionType:'3',Ds_AuthorisationCode:'629297',...overrides})).toString('base64');return{Ds_SignatureVersion:'HMAC_SHA256_V1',Ds_MerchantParameters:params,Ds_Signature:refund.sign(params,secret,orderId)}}
function signedNotification(order,amount,response='0000'){const params=Buffer.from(JSON.stringify({Ds_Amount:String(amount),Ds_Currency:'978',Ds_Order:order,Ds_Response:response,Ds_AuthorisationCode:'ABC123'})).toString('base64');return{Ds_SignatureVersion:'HMAC_SHA256_V1',Ds_MerchantParameters:params,Ds_Signature:refund.sign(params,secret,order)}}
function formBody(bank){return new URLSearchParams(bank).toString()}
(async()=>{
 const ok=refund.verifyRefundResponse(signedResponse(),{secret,orderId,amountCents,merchant,terminal});assert.strictEqual(ok.ok,true,'Una respuesta firmada y coherente debe aceptarse');
 const tampered=signedResponse();tampered.Ds_MerchantParameters=Buffer.from(JSON.stringify({Ds_Amount:'999',Ds_Currency:'978',Ds_Order:orderId,Ds_Response:'0900',Ds_TransactionType:'3'})).toString('base64');assert.strictEqual(refund.verifyRefundResponse(tampered,{secret,orderId,amountCents,merchant,terminal}).ok,false,'Modificar MerchantParameters invalida la firma');
 assert.strictEqual(refund.verifyRefundResponse(signedResponse({Ds_Amount:'144'}),{secret,orderId,amountCents,merchant,terminal}).ok,false,'El importe de respuesta debe coincidir');
 assert.strictEqual(refund.verifyRefundResponse(signedResponse({Ds_Order:'OTROPEDIDO'}),{secret,orderId,amountCents,merchant,terminal}).ok,false,'El pedido de respuesta debe coincidir');
 const first=await lock.acquire('refund:test',{ttlMs:10000});assert(first,'El primer proceso adquiere el lock');const contenders=await Promise.all(Array.from({length:12},()=>lock.acquire('refund:test',{ttlMs:10000})));assert.strictEqual(contenders.filter(Boolean).length,0,'Ningún segundo proceso adquiere el mismo lock activo');assert.strictEqual(await lock.release(first),true,'El propietario libera el lock');const second=await lock.acquire('refund:test',{ttlMs:10000});assert(second,'Tras liberar, otro proceso puede adquirirlo');await lock.release(second);
 const orders=getBlobStore('redsys-orders'),mismatchOrder='0920MISMATCH';await orders.setJSON(mismatchOrder,{order:mismatchOrder,email:'buyer@example.com',items:[{id:1,code:'SKU',name:'Producto',qty:1}],amount:2.95,currency:'978',status:'PENDING',inventoryReservation:{status:'RESERVED'}});
 const bank=signedNotification(mismatchOrder,294),result=await notify.handler({httpMethod:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(bank)});assert.strictEqual(result.statusCode,200,'Una notificación firmada discrepante debe quedar registrada para revisión');
 const held=await orders.get(mismatchOrder,{type:'json'});assert.strictEqual(held.fulfilmentStatus,'REVIEW_REQUIRED');assert.strictEqual(held.inventoryReservation.status,'HELD_REVIEW','La reserva no debe consumirse ni liberarse mientras se concilia el cobro');assert.strictEqual(held.paymentReview.held,true);assert.strictEqual(held.amount,2.95,'El importe esperado del pedido no puede ser sobrescrito por el banco');assert.strictEqual(held.bankAmount,2.94,'El importe bancario se conserva aparte para conciliación');
 const publicStatus=await status.handler({httpMethod:'GET',headers:{},queryStringParameters:{order:mismatchOrder}}),publicBody=JSON.parse(publicStatus.body);assert.strictEqual(publicBody.status,'PENDING','Un cobro en revisión nunca se publica como PAID');assert.strictEqual(publicBody.reviewRequired,true);
 const browserReturn=await pagoReturn.handler({httpMethod:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},queryStringParameters:{result:'ok'},body:formBody(bank)});assert(!browserReturn.headers.Location.includes('estado=PAID'),'La vuelta del navegador no puede anunciar PAID si el importe no concilia');
 console.log('[test-refund-security] OK · firma/importe/pedido Redsys · lock · hold · status/return conciliados');
})().catch(err=>{console.error(err);process.exit(1)});