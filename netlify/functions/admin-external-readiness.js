'use strict';
const {exigeAdmin}=require('../lib/admin');
const {cabecerasCORS}=require('../lib/cors');
const settings=require('../lib/settings');
const {assessExternalReadiness}=require('../lib/external-readiness');
const CORS=cabecerasCORS('GET, OPTIONS');
const reply=(statusCode,body)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(body)});
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return reply(405,{error:'Method Not Allowed'});
 const auth=await exigeAdmin(event);if(!auth.ok)return reply(auth.statusCode,{error:auth.error});
 try{
  const commerce=await settings.read();
  const readiness=await assessExternalReadiness({shipping:commerce.shipping});
  return reply(200,readiness);
 }catch(error){
  console.error('[admin-external-readiness]',error);
  return reply(503,{ready:false,error:'No se pudo verificar el estado externo.',checkedAt:new Date().toISOString()});
 }
};
