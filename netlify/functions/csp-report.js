'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('../lib/blob-store');
const clean=(v,n)=>String(v||'').replace(/[<>]/g,'').slice(0,n);
exports.handler=async event=>{
 if(event.httpMethod!=='POST')return{statusCode:204,headers:{'Cache-Control':'no-store'},body:''};
 let body;try{body=JSON.parse(event.body||'{}')}catch{return{statusCode:204,headers:{'Cache-Control':'no-store'},body:''}};
 const r=body['csp-report']||body.body||body;const record={id:crypto.randomUUID(),at:new Date().toISOString(),documentUri:clean(r.documentUri||r['document-uri'],240),blockedUri:clean(r.blockedURL||r['blocked-uri'],240),effectiveDirective:clean(r.effectiveDirective||r['effective-directive']||r.violatedDirective||r['violated-directive'],120),sourceFile:clean(r.sourceFile||r['source-file'],240),line:Number(r.lineNumber||r['line-number']||0)||0,column:Number(r.columnNumber||r['column-number']||0)||0,disposition:clean(r.disposition,40)};
 const store=getBlobStore('csp-reports-v1');if(store)await store.setJSON(`report/${record.at.slice(0,10)}/${record.id}`,record).catch(()=>{});
 return{statusCode:204,headers:{'Cache-Control':'no-store'},body:''};
};
