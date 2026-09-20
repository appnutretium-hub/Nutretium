'use strict';
const enterprise=require('../lib/enterprise-store');
const {requireStaff}=require('../lib/staff');
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('GET, OPTIONS');
const json=(s,b)=>({statusCode:s,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(b)});
function daysUntil(value,now=Date.now()){const t=Date.parse(String(value||''));return Number.isFinite(t)?Math.ceil((t-now)/86400000):null}
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return json(405,{error:'Method Not Allowed'});
 const auth=await requireStaff(event,'inventory.read');if(!auth.ok)return json(auth.statusCode,{error:auth.error});
 try{
  const rows=await enterprise.list('inventory-lots',{limit:1000});
  const now=Date.now();const normalized=rows.map(r=>({...r,daysToExpiry:daysUntil(r.expiresAt,now)}));
  const active=normalized.filter(r=>!['depleted'].includes(r.status));
  const expired=active.filter(r=>r.daysToExpiry!==null&&r.daysToExpiry<0);
  const expiring30=active.filter(r=>r.daysToExpiry!==null&&r.daysToExpiry>=0&&r.daysToExpiry<=30);
  const expiring60=active.filter(r=>r.daysToExpiry!==null&&r.daysToExpiry>30&&r.daysToExpiry<=60);
  const blocked=active.filter(r=>['quarantine','recalled'].includes(r.status));
  const missingTraceability=active.filter(r=>!r.lotCode||!r.expiresAt||!r.sku||!r.warehouseId);
  return json(200,{summary:{lots:rows.length,active:active.length,expired:expired.length,expiring30:expiring30.length,expiring60:expiring60.length,blocked:blocked.length,missingTraceability:missingTraceability.length},attention:[...expired,...blocked,...expiring30].sort((a,b)=>(a.daysToExpiry??99999)-(b.daysToExpiry??99999)).slice(0,100),generatedAt:new Date().toISOString()});
 }catch(err){return json(500,{error:err.message||'No se pudo cargar la trazabilidad.'})}
};
exports._test={daysUntil};
