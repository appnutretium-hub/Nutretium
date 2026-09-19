'use strict';

const crypto=require('crypto');
const { getBlobStore }=require('../lib/blob-store');

function validSignature(payload,header,secret){
  const parts=Object.fromEntries(String(header||'').split(',').map(p=>p.split('=')));
  if(!parts.t||!parts.v1)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${parts.t}.${payload}`).digest('hex');
  const a=Buffer.from(parts.v1),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b)&&Math.abs(Date.now()/1000-Number(parts.t))<300;
}
exports.handler=async function(event){
  const secret=process.env.STRIPE_WEBHOOK_SECRET;if(!secret)return {statusCode:503,body:'Webhook no configurado'};
  if(!validSignature(event.body||'',event.headers['stripe-signature'],secret))return {statusCode:400,body:'Firma no válida'};
  let stripeEvent;try{stripeEvent=JSON.parse(event.body);}catch{return {statusCode:400,body:'JSON no válido'};}
  if(stripeEvent.type==='checkout.session.completed'){
    const session=stripeEvent.data.object,order=session.client_reference_id||session.metadata?.order;
    const store=getBlobStore('stripe-orders');if(store&&order){const record=await store.get(order,{type:'json'}).catch(()=>null);if(record){record.status=session.payment_status==='paid'?'PAID':'PENDING';record.paidAt=new Date().toISOString();record.stripePaymentIntent=session.payment_intent||null;await store.setJSON(order,record);}}
  }
  return {statusCode:200,body:'ok'};
};
