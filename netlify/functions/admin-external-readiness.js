'use strict';
const {exigeAdmin}=require('../lib/admin');
const {cabecerasCORS}=require('../lib/cors');
const shipping=require('../lib/shipping');
const paymentConfig=require('../lib/payment-config');
const {assessExternalReadiness}=require('../lib/external-readiness');
const CORS=cabecerasCORS('GET, OPTIONS');
const reply=(statusCode,body)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(body)});
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return reply(405,{error:'Method Not Allowed'});
 const auth=await exigeAdmin(event);if(!auth.ok)return reply(auth.statusCode,{error:auth.error});
 try{
  const [shippingPolicy,payment]=await Promise.all([shipping.policy(),paymentConfig.resolve()]);
  return reply(200,await assessExternalReadiness({env:process.env,shipping:shippingPolicy,payment}));
 }catch(error){
  console.error('[admin-external-readiness]',error);
  return reply(503,{ready:false,error:'No se pudo verificar el estado externo.',checkedAt:new Date().toISOString()});
 }
};
