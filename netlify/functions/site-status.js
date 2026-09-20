'use strict';
const {cabecerasCORS}=require('../lib/cors');
const shipping=require('../lib/shipping');
const paymentConfig=require('../lib/payment-config');
const CORS=cabecerasCORS('GET, OPTIONS');
const yes=n=>String(process.env[n]||'').toLowerCase()==='true';
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const maintenance=yes('MAINTENANCE_MODE');
 const [shippingReady,payment]=await Promise.all([shipping.configured().catch(()=>false),paymentConfig.publicStatus().catch(()=>({managed:false,enabled:false,environment:'test',commerceLive:false,credentialsConfigured:false,ready:false}))]);
 const paymentsReady=Boolean(payment.enabled&&payment.environment==='production'&&payment.commerceLive&&payment.credentialsConfigured&&shippingReady&&!maintenance);
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({maintenance,paymentsReady,shippingReady,payment:{managed:payment.managed,environment:payment.environment,enabled:payment.enabled,credentialsConfigured:payment.credentialsConfigured}})};
};
