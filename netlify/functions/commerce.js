'use strict';
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');
const { verifyEventSession } = require('../lib/session');
const promotions = require('../lib/promotions');
const settings = require('../lib/settings');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
function json(statusCode,payload){return{statusCode,headers:CORS,body:JSON.stringify(payload)}}
async function pedidosDe(email){const index=getBlobStore('user-orders'),orders=getBlobStore('redsys-orders');if(!index||!orders)return[];const ids=(await index.get(email,{type:'json'}).catch(()=>null))||[];const rows=await Promise.all(ids.slice(0,100).map(id=>orders.get(id,{type:'json'}).catch(()=>null)));return rows.filter(r=>r&&r.email===email)}
async function pointsConfig(){const stored=await settings.read().catch(()=>null);if(stored?.points?.managed===true){const n=Number(stored.points.perEuro)||0;return{enabled:Boolean(stored.points.enabled)&&n>0,perEuro:Boolean(stored.points.enabled)?Math.max(0,n):0,source:'managed'}}const raw=String(process.env.NUTRETIUM_POINTS_PER_EURO||'').trim();const n=Number(raw);if(raw&&Number.isFinite(n)&&n>0)return{enabled:true,perEuro:n,source:'env'};return{enabled:false,perEuro:0,source:'disabled'}}
function resumenPedidos(rows,pc){const paid=rows.filter(r=>r.status==='PAID'&&!r.amountMismatch),spent=paid.reduce((s,r)=>s+Number(r.amount||0),0),points=pc.enabled?Math.floor(spent*pc.perEuro):0,productCounts=new Map();paid.forEach(r=>(r.items||[]).forEach(i=>{const key=String(i.code||i.id||i.name||'');if(!key)return;const prev=productCounts.get(key)||{key,name:i.name||key,qty:0,last:null};prev.qty+=Number(i.qty||0);prev.last=r.receivedAt||r.createdAt||prev.last;productCounts.set(key,prev)}));return{orders:paid.length,spent:Number(spent.toFixed(2)),points,pointsEnabled:pc.enabled,pointsPerEuro:pc.enabled?pc.perEuro:null,pointsSource:pc.source,frequentProducts:[...productCounts.values()].sort((a,b)=>b.qty-a.qty).slice(0,8)}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod==='POST'){let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})};if(body.action==='coupon'){const subtotalCents=Math.max(0,Math.round(Number(body.subtotalCents)||0));const result=await promotions.calculaAsync(subtotalCents,body.code);return json(result.ok?200:422,result)}return json(400,{error:'Acción no reconocida.'})}
 if(event.httpMethod==='GET'){let session;try{session=await verifyEventSession(event)}catch{return json(401,{error:'Debes iniciar sesión.'})};const [rows,pc]=await Promise.all([pedidosDe(session.email),pointsConfig()]);return json(200,{summary:resumenPedidos(rows,pc)})}
 return json(405,{error:'Method Not Allowed'});
};