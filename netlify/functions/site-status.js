'use strict';
const {cabecerasCORS}=require('../lib/cors');
const shipping=require('../lib/shipping');
const CORS=cabecerasCORS('GET, OPTIONS');
const yes=n=>String(process.env[n]||'').toLowerCase()==='true';
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const maintenance=yes('MAINTENANCE_MODE');
 const shippingReady=await shipping.configured().catch(()=>false);
 const paymentsReady=String(process.env.REDSYS_ENV||'test')==='production'&&yes('COMMERCE_LIVE')&&Boolean(process.env.REDSYS_SECRET_KEY&&process.env.REDSYS_MERCHANT_CODE)&&shippingReady&&!maintenance;
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({maintenance,paymentsReady,shippingReady})};
};