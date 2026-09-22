'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('../lib/blob-store');
const {cabecerasCORS}=require('../lib/cors');
const {consume}=require('../lib/rate-limit');
const observability=require('../lib/observability');
const guardian=require('../lib/guardian-policy');
const CORS=cabecerasCORS('POST, OPTIONS');
const clean=(v,n)=>String(v||'').replace(/[<>]/g,'').slice(0,n);
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return{statusCode:405,headers:CORS,body:''};
 const rate=await consume({scope:'client-error',event,limit:30,windowMs:10*60*1000}).catch(()=>({allowed:false,degraded:true}));
 if(!rate.allowed)return{statusCode:204,headers:CORS,body:''};
 let b;try{b=JSON.parse(event.body||'{}')}catch{return{statusCode:204,headers:CORS,body:''}};
 const base=guardian.sanitizeIncident({
  kind:b.kind,message:b.message,path:b.path,actionId:b.actionId,method:b.method,url:b.url,status:b.status,contract:b.contract,recovery:b.recovery,
  source:b.source||b.extra?.source,extra:b.extra
 });
 const classification=guardian.classify(base),fingerprint=guardian.fingerprint(base),store=getBlobStore('client-errors');
 if(!store)return{statusCode:204,headers:CORS,body:''};
 const id=crypto.randomUUID(),record={
  id,fingerprint,...base,ua:clean(b.ua,240),line:Number(b.extra?.line||0)||0,col:Number(b.extra?.col||0)||0,
  severity:classification.severity,protectedArea:classification.protectedArea,canRuntimeRecover:classification.canRuntimeRecover,requiresCodeReview:classification.requiresCodeReview,
  createdAt:new Date().toISOString()
 };
 try{await store.setJSON(id,record)}catch{}
 await observability.record('guardian-incident',{
  severity:classification.severity,source:'guardian-runtime',message:`${base.kind||'runtime'} · ${base.path}${base.actionId?` · ${base.actionId}`:''}${base.status?` · HTTP ${base.status}`:''}`,
  tags:{fingerprint,kind:base.kind,path:base.path,actionId:base.actionId||'',recovery:base.recovery||'',protected:String(classification.protectedArea)}
 }).catch(()=>{});
 return{statusCode:204,headers:CORS,body:''};
};