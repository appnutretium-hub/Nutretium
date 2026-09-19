'use strict';
const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');
const { exigePermiso } = require('../lib/staff');
const CORS=cabecerasCORS('GET, OPTIONS');
function json(statusCode,payload){return{statusCode,headers:CORS,body:JSON.stringify(payload)}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return json(405,{error:'Method Not Allowed'});
 const staff=await exigePermiso(event,'analytics');if(!staff.ok)return json(staff.statusCode,{error:staff.error});
 const store=getBlobStore('analytics-daily');if(!store)return json(503,{error:'Analítica no disponible.'});
 const listing=await store.list();const keys=(listing.blobs||[]).map(b=>b.key).sort().reverse().slice(0,30);
 const rows=(await Promise.all(keys.map(k=>store.get(k,{type:'json'}).catch(()=>null)))).filter(Boolean);
 const totals={};rows.forEach(r=>Object.entries(r.events||{}).forEach(([k,v])=>totals[k]=(totals[k]||0)+Number(v||0)));
 return json(200,{days:rows,totals,operator:staff.email});
};
