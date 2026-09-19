'use strict';

const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');

const CORS = cabecerasCORS('POST, OPTIONS');
const EVENTS = new Set(['view_item','search','add_to_cart','begin_checkout','purchase_view','coupon_apply','recommendation','wishlist']);

function json(statusCode,payload){ return {statusCode,headers:CORS,body:JSON.stringify(payload)}; }

exports.handler = async function(event){
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:CORS,body:''};
  if(event.httpMethod!=='POST') return json(405,{error:'Method Not Allowed'});
  let body;
  try{ body=JSON.parse(event.body||'{}'); } catch { return json(400,{error:'JSON no válido.'}); }
  const name=String(body.name||'').trim();
  if(!EVENTS.has(name)) return json(400,{error:'Evento no permitido.'});
  const store=getBlobStore('analytics-daily');
  if(!store) return json(503,{error:'Analítica no disponible.'});
  const day=new Date().toISOString().slice(0,10);
  const row=(await store.get(day,{type:'json'}).catch(()=>null))||{date:day,events:{}};
  row.events[name]=(Number(row.events[name])||0)+1;
  row.updatedAt=new Date().toISOString();
  await store.setJSON(day,row);
  return json(202,{ok:true});
};
