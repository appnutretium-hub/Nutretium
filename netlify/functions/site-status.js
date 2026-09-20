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
 const [shippingReady,payment]=await Promise.all([shipping.configured().catch(()=>false),paymentConfig.publicStatus().catch(()=>({managed:false,enabled:false,environment:'test',commerceLive:false,credentialsConfigured:false,dedicatedVaultKey:false,ready:false}))]);
 const storefrontReady=!maintenance;
 const commerceReady=Boolean(storefrontReady&&shippingReady&&payment.enabled&&payment.environment==='production'&&payment.commerceLive&&payment.credentialsConfigured&&(!payment.managed||payment.dedicatedVaultKey));
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({maintenance,storefrontReady,commerceReady,paymentsReady:commerceReady,shippingReady,payment:{managed:payment.managed,environment:payment.environment,enabled:payment.enabled,commerceLive:payment.commerceLive,credentialsConfigured:payment.credentialsConfigured,dedicatedVaultKey:payment.dedicatedVaultKey}})};
};
