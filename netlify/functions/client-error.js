'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('../lib/blob-store');
const {cabecerasCORS}=require('../lib/cors');
const {consume}=require('../lib/rate-limit');
const CORS=cabecerasCORS('POST, OPTIONS');
const clean=(v,n)=>String(v||'').replace(/[<>]/g,'').slice(0,n);
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return{statusCode:405,headers:CORS,body:''};
 const rate=await consume({scope:'client-error',event,limit:20,windowMs:10*60*1000}).catch(()=>({allowed:true}));if(!rate.allowed)return{statusCode:204,headers:CORS,body:''};
 let b;try{b=JSON.parse(event.body||'{}')}catch{return{statusCode:204,headers:CORS,body:''}};
 const store=getBlobStore('client-errors');if(!store)return{statusCode:204,headers:CORS,body:''};
 const id=crypto.randomUUID(),record={id,kind:clean(b.kind,40),message:clean(b.message,500),path:clean(b.path,200),ua:clean(b.ua,240),source:clean(b.extra?.source,100),line:Number(b.extra?.line||0)||0,col:Number(b.extra?.col||0)||0,createdAt:new Date().toISOString()};
 try{await store.setJSON(id,record)}catch{}
 return{statusCode:204,headers:CORS,body:''};
};