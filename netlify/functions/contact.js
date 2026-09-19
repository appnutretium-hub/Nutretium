/** Formulario público persistido en Netlify Blobs con rate limit separado. */
'use strict';
const crypto=require('crypto');
const {cabecerasCORS}=require('../lib/cors');
const {getBlobStore}=require('../lib/blob-store');
const {consume}=require('../lib/rate-limit');
const CORS=cabecerasCORS('POST, OPTIONS');
const MAX_NAME=100,MAX_EMAIL=200,MAX_SUBJECT=200,MAX_MESSAGE=2000;
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const json=(statusCode,body,headers={})=>({statusCode,headers:{...CORS,...headers},body:JSON.stringify(body)});
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON inválido.'})}
 const name=clean(body.name,MAX_NAME),email=clean(body.email,MAX_EMAIL).toLowerCase(),subject=clean(body.subject||'(sin asunto)',MAX_SUBJECT),message=clean(body.message,MAX_MESSAGE);
 if(!name||!email||!message)return json(400,{error:'Nombre, email y mensaje son obligatorios.'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(400,{error:'Email inválido.'});
 if(name.length<2)return json(400,{error:'El nombre es demasiado corto.'});
 if(message.length<10)return json(400,{error:'El mensaje debe tener al menos 10 caracteres.'});
 const rate=await consume({scope:'contact',event,extra:email,limit:5,windowMs:10*60*1000}).catch(()=>({allowed:true,degraded:true}));
 if(!rate.allowed)return json(429,{error:'Has enviado varias solicitudes seguidas. Espera unos minutos antes de volver a intentarlo.'},{'Retry-After':String(rate.retryAfter)});
 const store=getBlobStore('contact-messages');if(!store)return json(503,{error:'El formulario no está disponible temporalmente. Contacta con Nutretium por teléfono o inténtalo más tarde.'});
 try{const record={id:crypto.randomUUID(),name,email,subject,message,createdAt:new Date().toISOString(),read:false};await store.setJSON(record.id,record);console.log('[Contact]',JSON.stringify({id:record.id,subject:record.subject}));return json(200,{success:true,message:'Mensaje recibido.'})}catch(err){console.error('[Contact] No se pudo persistir el mensaje:',err?.message||err);return json(503,{error:'No hemos podido registrar el mensaje. Inténtalo de nuevo en unos minutos.'})}
};