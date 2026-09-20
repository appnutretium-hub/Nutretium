'use strict';
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
globalThis.__NUTRETIUM_TEST_BLOBS__=new Map();
globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map();
const refund=require('../netlify/functions/refund-redsys')._test;
const lock=require('../netlify/lib/distributed-lock');
const secret=Buffer.alloc(24,7).toString('base64'),orderId='0920ABC12345',amountCents=145,merchant='999008881',terminal='1';
function signedResponse(overrides={}){
 const params=Buffer.from(JSON.stringify({Ds_Amount:String(amountCents),Ds_Currency:'978',Ds_Order:orderId,Ds_MerchantCode:merchant,Ds_Terminal:terminal,Ds_Response:'0900',Ds_TransactionType:'3',Ds_AuthorisationCode:'629297',...overrides})).toString('base64');
 return{Ds_SignatureVersion:'HMAC_SHA256_V1',Ds_MerchantParameters:params,Ds_Signature:refund.sign(params,secret,orderId)};
}
(async()=>{
 const ok=refund.verifyRefundResponse(signedResponse(),{secret,orderId,amountCents,merchant,terminal});assert.strictEqual(ok.ok,true,'Una respuesta firmada y coherente debe aceptarse');
 const tampered=signedResponse();tampered.Ds_MerchantParameters=Buffer.from(JSON.stringify({Ds_Amount:'999',Ds_Currency:'978',Ds_Order:orderId,Ds_Response:'0900',Ds_TransactionType:'3'})).toString('base64');assert.strictEqual(refund.verifyRefundResponse(tampered,{secret,orderId,amountCents,merchant,terminal}).ok,false,'Modificar MerchantParameters invalida la firma');
 const wrongAmount=refund.verifyRefundResponse(signedResponse({Ds_Amount:'144'}),{secret,orderId,amountCents,merchant,terminal});assert.strictEqual(wrongAmount.ok,false,'El importe de respuesta debe coincidir');
 const wrongOrder=refund.verifyRefundResponse(signedResponse({Ds_Order:'OTROPEDIDO'}),{secret,orderId,amountCents,merchant,terminal});assert.strictEqual(wrongOrder.ok,false,'El pedido de respuesta debe coincidir');
 const first=await lock.acquire('refund:test',{ttlMs:10000});assert(first,'El primer proceso adquiere el lock');
 const contenders=await Promise.all(Array.from({length:12},()=>lock.acquire('refund:test',{ttlMs:10000})));assert.strictEqual(contenders.filter(Boolean).length,0,'Ningún segundo proceso adquiere el mismo lock activo');
 assert.strictEqual(await lock.release(first),true,'El propietario libera el lock');
 const second=await lock.acquire('refund:test',{ttlMs:10000});assert(second,'Tras liberar, otro proceso puede adquirirlo');await lock.release(second);
 console.log('[test-refund-security] OK · firma/importe/pedido Redsys · lock distribuido de reembolso');
})().catch(err=>{console.error(err);process.exit(1)});