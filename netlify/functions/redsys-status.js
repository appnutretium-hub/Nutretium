/**
 * netlify/functions/redsys-status.js — NUTRETIUM
 * Estado autoritativo del pedido confirmado por redsys-notify.
 */
'use strict';
const {getBlobStore}=require('../lib/blob-store');
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('GET, OPTIONS');
async function getStore(){return getBlobStore('redsys-orders')}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const order=(event.queryStringParameters||{}).order;if(!order||!/^[0-9A-Za-z]{4,12}$/.test(order))return{statusCode:400,headers:CORS,body:JSON.stringify({error:'Pedido inválido.'})};
 const store=await getStore();if(!store)return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({order,found:false,status:'PENDING'})};
 let rec=null;try{rec=await store.get(order,{type:'json',consistency:'strong'})}catch{rec=null}
 if(!rec)return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({order,found:false,status:'PENDING'})};
 const review=Boolean(rec.amountMismatch)||rec.fulfilmentStatus==='REVIEW_REQUIRED';
 const publicStatus=review?'PENDING':(rec.status==='PAID'?'PAID':rec.status==='FAILED'?'FAILED':'PENDING');
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({order,found:true,status:publicStatus,amount:review?null:Number(rec.amount||0),reviewRequired:review})};
};