'use strict';

const crypto=require('crypto');
const queue=require('../lib/ollama-queue');

const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(statusCode,body)=>({statusCode,headers:JSON_HEADERS,body:JSON.stringify(body)});
const safe=(v,max=160)=>String(v??'').trim().slice(0,max);
function sameSecret(a,b){
 const left=crypto.createHash('sha256').update(String(a||'')).digest(),right=crypto.createHash('sha256').update(String(b||'')).digest();
 return crypto.timingSafeEqual(left,right)&&Boolean(a)&&Boolean(b);
}
function tokenFrom(event){return event.headers?.['x-nutretium-runner-token']||event.headers?.['X-Nutretium-Runner-Token']||''}
function authorised(event){const expected=process.env.AI_OLLAMA_RUNNER_TOKEN||'';return expected.length>=24&&sameSecret(tokenFrom(event),expected)}

exports.handler=async function(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 if(!authorised(event))return json(401,{error:'Runner no autorizado.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 const action=safe(body.action,30),runnerId=safe(body.runnerId,120);
 try{
  if(action==='claim'){
   if(!runnerId)return json(400,{error:'runnerId obligatorio.'});
   const job=await queue.claim({runnerId,leaseMs:body.leaseMs});
   return json(200,{ok:true,job});
  }
  if(action==='heartbeat'){
   const result=await queue.heartbeat({id:body.id,leaseId:body.leaseId,runnerId,leaseMs:body.leaseMs});
   return json(result.ok?200:409,result);
  }
  if(action==='complete'){
   const result=await queue.complete({id:body.id,leaseId:body.leaseId,result:body.result,model:body.model});
   return json(result.ok?200:409,result.ok?{ok:true,id:result.job.id,status:result.job.status}:{ok:false,code:result.code});
  }
  if(action==='fail'){
   const result=await queue.fail({id:body.id,leaseId:body.leaseId,error:body.error,retryDelayMs:body.retryDelayMs});
   return json(result.ok?200:409,result.ok?{ok:true,id:result.job.id,status:result.job.status,attempts:result.job.attempts}:{ok:false,code:result.code});
  }
  if(action==='status')return json(200,{ok:true,queue:await queue.stats()});
  return json(400,{error:'Acción no reconocida.'});
 }catch(error){console.error('[ai-ollama-runner]',safe(error?.message||error,400));return json(500,{error:'Runner bridge no disponible.'})}
};

exports._test={sameSecret,authorised};
