'use strict';
const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');
const { exigePermiso } = require('../lib/staff');
const CORS=cabecerasCORS('GET, OPTIONS');
function json(statusCode,payload){return{statusCode,headers:CORS,body:JSON.stringify(payload)}}
function ratio(a,b){const n=Number(a||0),d=Number(b||0);return d>0?Math.round(n/d*10000)/100:null}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return json(405,{error:'Method Not Allowed'});
 const staff=await exigePermiso(event,'analytics.read');if(!staff.ok)return json(staff.statusCode,{error:staff.error});
 const store=getBlobStore('analytics-daily');if(!store)return json(503,{error:'Analítica no disponible.'});
 const listing=await store.list();const keys=(listing.blobs||[]).map(b=>b.key).sort().reverse().slice(0,30);
 const rows=(await Promise.all(keys.map(k=>store.get(k,{type:'json'}).catch(()=>null)))).filter(Boolean);
 const totals={};rows.forEach(r=>Object.entries(r.events||{}).forEach(([k,v])=>totals[k]=(totals[k]||0)+Number(v||0)));
 const funnel={viewItem:Number(totals.view_item||0),addToCart:Number(totals.add_to_cart||0),beginCheckout:Number(totals.begin_checkout||0),purchaseView:Number(totals.purchase_view||0)};
 funnel.viewToCartPct=ratio(funnel.addToCart,funnel.viewItem);funnel.cartToCheckoutPct=ratio(funnel.beginCheckout,funnel.addToCart);funnel.checkoutToPurchaseViewPct=ratio(funnel.purchaseView,funnel.beginCheckout);funnel.viewToPurchaseViewPct=ratio(funnel.purchaseView,funnel.viewItem);
 return json(200,{days:rows,totals,funnel,measurement:{periodDays:rows.length,note:'Ratios calculados exclusivamente con eventos registrados; no equivalen a usuarios únicos ni sustituyen la conciliación de pagos.'},operator:staff.email});
};
exports._test={ratio};
