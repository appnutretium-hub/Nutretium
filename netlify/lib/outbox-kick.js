'use strict';
const auth=require('./internal-auth');
const {record}=require('./observability');
function baseUrl(){return String(process.env.DEPLOY_PRIME_URL||process.env.URL||'').trim().replace(/\/$/,'');}
async function kick({traceId=''}={}){
 const base=baseUrl();if(!base)return{ok:false,skipped:true,reason:'site-url-unavailable'};
 if(!process.env.JWT_SECRET)return{ok:false,skipped:true,reason:'internal-auth-unconfigured'};
 const target=`${base}/.netlify/functions/outbox-dispatch-background`,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500);
 try{
  const response=await fetch(target,{method:'POST',headers:{...auth.headers('outbox-dispatch'),'X-Nutretium-Trace-ID':String(traceId||'')},signal:controller.signal});
  const ok=response.status===202||response.ok;if(!ok)await record('outbox_kick_failure',{severity:'warning',source:'outbox-kick',message:`Background dispatcher respondió ${response.status}`,tags:{traceId:String(traceId||'')}}).catch(()=>{});return{ok,status:response.status};
 }catch(err){await record('outbox_kick_failure',{severity:'warning',source:'outbox-kick',message:String(err.message||err),tags:{traceId:String(traceId||'')}}).catch(()=>{});return{ok:false,error:String(err.message||err).slice(0,200)};}finally{clearTimeout(timer)}
}
module.exports={baseUrl,kick};
