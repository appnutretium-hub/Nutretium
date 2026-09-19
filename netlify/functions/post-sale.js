'use strict';

const crypto = require('crypto');
const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');
const { verifyEventSession } = require('../lib/session');
const { consume } = require('../lib/rate-limit');

const CORS = cabecerasCORS('GET, POST, OPTIONS');
const response = (statusCode,payload,extra={}) => ({statusCode,headers:{...CORS,...extra},body:JSON.stringify(payload)});
const safeText = (v,max=500) => String(v||'').trim().replace(/[<>]/g,'').slice(0,max);
const clone = v => JSON.parse(JSON.stringify(v));

async function loadOrder(order,email){
  const store=getBlobStore('redsys-orders');if(!store)return null;
  const rec=await store.get(String(order||''),{type:'json',consistency:'strong'}).catch(()=>null);
  if(!rec||String(rec.email||'').toLowerCase()!==String(email||'').toLowerCase())return null;
  return rec;
}
async function readRequests(store,key){
  const rec=await store.get(key,{type:'json',consistency:'strong'}).catch(()=>null);
  return Array.isArray(rec?.requests)?rec.requests:[];
}
async function mutateRequests(store,key,updater){
  if(typeof store.getWithMetadata!=='function')throw new Error('conditional-store-required');
  for(let i=0;i<12;i++){
    const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'}).catch(()=>null);
    const current=entry?.data&&typeof entry.data==='object'?clone(entry.data):{requests:[]};
    current.requests=Array.isArray(current.requests)?current.requests:[];
    const out=updater(current);
    if(out?.noWrite)return out.result;
    const opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true};
    const write=await store.setJSON(key,out.data,opts).catch(()=>null);
    if(write?.modified===true)return out.result;
  }
  throw new Error('post-sale-conflict');
}

exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  if(!['GET','POST'].includes(event.httpMethod))return response(405,{error:'Method Not Allowed'});
  let session;try{session=await verifyEventSession(event)}catch{return response(401,{error:'Sesión caducada. Vuelve a iniciar sesión.'})}
  const store=getBlobStore('post-sale');
  if(!store||typeof store.getWithMetadata!=='function')return response(503,{error:'Postventa no disponible en este momento.'});
  const key=session.email;
  if(event.httpMethod==='GET')return response(200,{requests:(await readRequests(store,key)).slice(0,100)});

  const rate=await consume({scope:'post-sale',event,extra:session.email,limit:8,windowMs:60*60*1000});
  if(!rate.allowed)return response(429,{error:'Demasiadas solicitudes. Inténtalo más tarde.'},{'Retry-After':String(rate.retryAfter||60)});
  let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'Invalid JSON'})}
  const order=safeText(body.order,40),orderRec=await loadOrder(order,session.email);
  if(!orderRec)return response(404,{error:'Pedido no encontrado para esta cuenta.'});
  if(orderRec.status!=='PAID')return response(409,{error:'La postventa solo puede tramitarse sobre pedidos pagados.'});

  if(body.action==='request-return'){
    const reason=safeText(body.reason,600);if(reason.length<5)return response(400,{error:'Indica brevemente el motivo de la devolución.'});
    try{
      const result=await mutateRequests(store,key,current=>{
        const duplicate=current.requests.find(r=>r.type==='RETURN'&&r.order===order&&['REQUESTED','REVIEW'].includes(r.status));
        if(duplicate)return{noWrite:true,result:{statusCode:200,payload:{request:duplicate,idempotent:true}}};
        const req={id:crypto.randomUUID(),type:'RETURN',order,status:'REQUESTED',reason,createdAt:new Date().toISOString(),refundStatus:'NOT_STARTED'};
        return{data:{...current,requests:[req,...current.requests].slice(0,100)},result:{statusCode:201,payload:{request:req}}};
      });
      return response(result.statusCode,result.payload);
    }catch{return response(409,{error:'Se ha producido un conflicto al registrar la solicitud. Reinténtalo.'})}
  }

  if(body.action==='request-invoice'){
    const legalName=safeText(body.legalName,120),taxId=safeText(body.taxId,40),billingAddress=safeText(body.billingAddress,220);
    if(!legalName||!taxId||!billingAddress)return response(400,{error:'Razón social/nombre fiscal, NIF/CIF y dirección fiscal son obligatorios.'});
    try{
      const result=await mutateRequests(store,key,current=>{
        const duplicate=current.requests.find(r=>r.type==='INVOICE'&&r.order===order&&['REQUESTED','REVIEW'].includes(r.status));
        if(duplicate)return{noWrite:true,result:{statusCode:200,payload:{request:duplicate,idempotent:true}}};
        const req={id:crypto.randomUUID(),type:'INVOICE',order,status:'REQUESTED',legalName,taxId,billingAddress,createdAt:new Date().toISOString(),documentStatus:'NOT_ISSUED'};
        return{data:{...current,requests:[req,...current.requests].slice(0,100)},result:{statusCode:201,payload:{request:req,note:'Solicitud registrada. La emisión fiscal requiere validación y numeración del sistema de facturación.'}}};
      });
      return response(result.statusCode,result.payload);
    }catch{return response(409,{error:'Se ha producido un conflicto al registrar la solicitud. Reinténtalo.'})}
  }

  return response(400,{error:'Acción no reconocida.'});
};
