/** Historial de pedidos del usuario autenticado. */
'use strict';
const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');
const { verifyCustomerEventSession } = require('../lib/session');
const CORS = cabecerasCORS('GET, OPTIONS');
const MAX_PEDIDOS = 50;
function toPublic(rec){return{order:rec.order,status:rec.status||'PENDING',fulfilmentStatus:rec.fulfilmentStatus||null,amount:rec.amount,items:Array.isArray(rec.items)?rec.items:[],authCode:rec.authCode||null,createdAt:rec.createdAt||null,receivedAt:rec.receivedAt||null,tracking:rec.tracking?{carrier:String(rec.tracking.carrier||''),code:String(rec.tracking.code||''),url:String(rec.tracking.url||'')}:null,updatedAt:rec.updatedAt||null}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 let session;try{session=await verifyCustomerEventSession(event)}catch{return{statusCode:401,headers:CORS,body:JSON.stringify({error:'Sesión caducada. Vuelve a iniciar sesión.'})}}
 const email=session.email,index=getBlobStore('user-orders'),store=getBlobStore('redsys-orders');
 if(!index||!store)return{statusCode:503,headers:CORS,body:JSON.stringify({error:'Almacenamiento no disponible.'})};
 const numeros=(await index.get(email,{type:'json'}).catch(()=>null))||[];
 if(!numeros.length)return{statusCode:200,headers:CORS,body:JSON.stringify({orders:[]})};
 const registros=await Promise.all(numeros.slice(0,MAX_PEDIDOS).map(n=>store.get(n,{type:'json'}).catch(()=>null)));
 const orders=registros.filter(r=>r&&(!r.email||r.email===email)).map(toPublic);
 return{statusCode:200,headers:CORS,body:JSON.stringify({orders})};
};