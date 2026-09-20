'use strict';
const {exigeAdmin}=require('../lib/admin');
const {cabecerasCORS}=require('../lib/cors');
const settings=require('../lib/settings');
const paymentConfig=require('../lib/payment-config');
const {assessExternalReadiness}=require('../lib/external-readiness');
const CORS=cabecerasCORS('GET, OPTIONS');
const reply=(statusCode,body)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(body)});
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return reply(405,{error:'Method Not Allowed'});
 const auth=await exigeAdmin(event);if(!auth.ok)return reply(auth.statusCode,{error:auth.error});
 try{
  const [commerce,payment]=await Promise.all([settings.read(),paymentConfig.resolve()]);
  const env=payment.managed?{...process.env,REDSYS_ENV:payment.environment,COMMERCE_LIVE:payment.commerceLive?'true':'false',REDSYS_SECRET_KEY:payment.secretKey||'',REDSYS_MERCHANT_CODE:payment.merchantCode||'',REDSYS_TERMINAL:payment.terminal||'1'}:process.env;
  return reply(200,await assessExternalReadiness({env,shipping:commerce.shipping}));
 }catch(error){
  console.error('[admin-external-readiness]',error);
  return reply(503,{ready:false,error:'No se pudo verificar el estado externo.',checkedAt:new Date().toISOString()});
 }
};
