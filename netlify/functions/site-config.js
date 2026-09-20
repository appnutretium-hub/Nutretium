'use strict';
const {cabecerasCORS}=require('../lib/cors');
const settings=require('../lib/settings');
const paymentConfig=require('../lib/payment-config');
const CORS=cabecerasCORS('GET, OPTIONS');
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const [s,payment]=await Promise.all([settings.read().catch(()=>settings.defaults),paymentConfig.publicStatus().catch(()=>({managed:false,enabled:false,provider:'redsys',environment:'test',commerceLive:false,credentialsConfigured:false,ready:false}))]);
 const payload={content:s.content,navigation:s.navigation,contact:s.contact,seo:s.seo,features:s.features,shipping:{managed:s.shipping.managed,enabled:s.shipping.enabled,rateCents:s.shipping.rateCents,freeFromCents:s.shipping.freeFromCents,country:s.shipping.country,label:s.shipping.label},payment};
 return{statusCode:200,headers:{...CORS,'Cache-Control':'public, max-age=30, s-maxage=60','X-Content-Type-Options':'nosniff'},body:JSON.stringify(payload)};
};
