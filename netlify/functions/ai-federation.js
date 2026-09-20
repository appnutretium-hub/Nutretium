'use strict';

const federation=require('../lib/federated-ai-router');
const runtime=require('../lib/ai-runtime');
const {requireStaff}=require('../lib/staff');
const {cabecerasCORS}=require('../lib/cors');
const security=require('../lib/security-policy');
const audit=require('../lib/audit-log');

const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,...security.securityHeaders(),'Cache-Control':'no-store'},body:JSON.stringify(body)});

exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  const auth=await requireStaff(event,event.httpMethod==='GET'?'platform.read':'platform.write');
  if(!auth.ok)return json(auth.statusCode,{error:auth.error});
  try{
    if(event.httpMethod==='GET')return json(200,{providers:federation.available(),externalSpendLimitEur:0,freeTierOnly:true});
    if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
    let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
    const view=await runtime.businessSnapshot();
    const result=await federation.query({question:body.question,task:body.task||'cross-check',context:view,minModels:body.minModels||2,maxModels:body.maxModels||3,learn:body.learn!==false});
    await audit.append({event,actor:auth.email,action:'AI_FEDERATION_QUERY',resource:String(body.task||'cross-check'),outcome:'SUCCESS',metadata:{status:result.status,providers:result.results?.map(x=>x.provider)||[],externalSpendLimitEur:0}}).catch(()=>{});
    return json(200,{result});
  }catch(error){
    console.error('[ai-federation]',error);
    return json(500,{error:error.message||'No se pudo ejecutar el contraste federado.'});
  }
};
