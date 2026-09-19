'use strict';
const crypto=require('crypto');
const enterprise=require('./enterprise-store');

function secretFor(hook){
  const envName=String(hook.secretEnv||'').trim();
  if(!envName)return null;
  return process.env[envName]||null;
}
function signature(secret,body){return 'sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');}
async function emit(event,payload){
  let hooks=[];try{hooks=await enterprise.list('webhooks',{limit:500});}catch{return{sent:0,failed:0,skipped:true};}
  const active=hooks.filter(h=>h.status==='active'&&Array.isArray(h.events)&&h.events.includes(event)&&!h.archivedAt);
  let sent=0,failed=0;
  for(const hook of active){
    const body=JSON.stringify({id:crypto.randomUUID(),event,createdAt:new Date().toISOString(),data:payload});
    const secret=secretFor(hook);
    const deliveryId=crypto.randomUUID();
    if(!secret){
      failed++;
      await enterprise.save('webhook-deliveries',{id:deliveryId,webhookId:hook.id,event,status:'failed',error:'secret_not_configured'},{email:'system@nutretium.local',role:'system'},{id:deliveryId,reason:'webhook'}).catch(()=>{});
      continue;
    }
    try{
      const response=await fetch(hook.url,{method:'POST',headers:{'Content-Type':'application/json','X-Nutretium-Event':event,'X-Nutretium-Signature':signature(secret,body),'Idempotency-Key':deliveryId},body,signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      sent++;
      await enterprise.save('webhook-deliveries',{id:deliveryId,webhookId:hook.id,event,status:'sent',statusCode:response.status},{email:'system@nutretium.local',role:'system'},{id:deliveryId,reason:'webhook'}).catch(()=>{});
    }catch(error){
      failed++;
      await enterprise.save('webhook-deliveries',{id:deliveryId,webhookId:hook.id,event,status:'failed',error:String(error.message||error).slice(0,500)},{email:'system@nutretium.local',role:'system'},{id:deliveryId,reason:'webhook'}).catch(()=>{});
    }
  }
  return{sent,failed,skipped:false};
}
module.exports={signature,emit};
