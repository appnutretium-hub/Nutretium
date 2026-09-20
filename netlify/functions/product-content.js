'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {requireStaff}=require('../lib/staff');
const content=require('../lib/product-content');
const audit=require('../lib/audit-log');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(body)});
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod==='GET'){
  const code=content.cleanCode(event.queryStringParameters?.code);if(!code)return json(400,{error:'Falta el código del producto.'});
  const record=await content.read(code);return json(200,{content:record||{code}});
 }
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 const auth=await requireStaff(event,'marketing.manage');if(!auth.ok)return json(auth.statusCode,{error:auth.error});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 if(body.action!=='save')return json(400,{error:'Acción no reconocida.'});
 try{const saved=await content.save(body.code,body.content||{},auth.email);await audit.append({event,actor:auth.email,action:'PRODUCT_CONTENT_UPDATED',resource:saved.code,outcome:'SUCCESS',metadata:{fields:Object.keys(body.content||{}).filter(k=>body.content[k]!==''&&body.content[k]!=null)}}).catch(()=>{});return json(200,{content:saved})}catch(err){return json(err.statusCode||500,{error:err.message||'No se pudo guardar la ficha.'})}
};