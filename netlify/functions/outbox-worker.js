'use strict';
const outbox=require('../lib/outbox');
const webhooks=require('../lib/webhooks');
const {sendEmail}=require('../lib/email');
const {record}=require('../lib/observability');

function orderEmail(payload){
 const order=String(payload.order||''),amount=Number(payload.amount||0).toFixed(2),mode=payload.fulfillment==='pickup'?'recogida en tienda':'envío';
 return{to:payload.email,subject:`Pedido ${order} confirmado — Nutretium`,html:`<div style="font-family:Arial,sans-serif"><h2>Pedido confirmado</h2><p>Hemos confirmado el pedido <strong>${order}</strong> por <strong>${amount} €</strong>.</p><p>Modalidad: <strong>${mode}</strong>.</p><p>Te avisaremos cuando avance la preparación.</p></div>`,idempotencyKey:`nutretium-enterprise-finalize/${order}`};
}
async function execute(job){
 if(job.type==='order.customer_email'){
  if(!job.payload?.email)return{skipped:true,reason:'no-email'};
  return sendEmail(orderEmail(job.payload));
 }
 if(job.type==='webhook.order_paid')return webhooks.emit('order.paid',job.payload||{});
 if(job.type==='webhook.order_payment_failed')return webhooks.emit('order.payment_failed',job.payload||{});
 throw new Error(`Tipo de outbox no soportado: ${job.type}`);
}
exports.handler=async function(){
 const summary={scanned:0,claimed:0,completed:0,retried:0,failed:0};
 try{
  const candidates=await outbox.due(25);summary.scanned=candidates.length;
  for(const candidate of candidates){
   const claimed=await outbox.claim(candidate.path);if(!claimed)continue;summary.claimed++;
   try{
    await execute(claimed.job);
    if(await outbox.finish(claimed.path,claimed.claimId,{ok:true}))summary.completed++;
   }catch(err){
    await outbox.finish(claimed.path,claimed.claimId,{ok:false,error:err.message});
    const current=(await outbox.due(100)).find(x=>x.path===claimed.path)?.job;
    if(current?.status==='failed')summary.failed++;else summary.retried++;
    await record('outbox_failure',{severity:'warning',source:'outbox-worker',message:String(err.message||err),tags:{type:claimed.job.type,id:claimed.job.id}}).catch(()=>{});
   }
  }
  return{statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:true,...summary})};
 }catch(err){
  await record('outbox_worker_failure',{severity:'high',source:'outbox-worker',message:String(err.message||err)}).catch(()=>{});
  return{statusCode:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:false,error:'Outbox worker failed'})};
 }
};
exports._test={execute,orderEmail};
