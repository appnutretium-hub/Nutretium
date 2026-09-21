'use strict';

const crypto=require('crypto');
const enterprise=require('./enterprise-store');
const {getBlobStore}=require('./blob-store');

const MAX_ROWS=1000;
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,20);
const text=(v,max=200)=>String(v??'').trim().slice(0,max);
const num=v=>Number.isFinite(Number(v))?Number(v):null;

async function listJsonStore(name,{limit=MAX_ROWS,prefix=''}={}){
 const store=getBlobStore(name);if(!store||typeof store.list!=='function')return[];
 const page=await store.list().catch(()=>null);if(!page||!Array.isArray(page.blobs))return[];
 const keys=page.blobs.map(x=>x.key).filter(k=>!prefix||String(k).startsWith(prefix)).slice(0,limit);
 const rows=await Promise.all(keys.map(async key=>{
  const value=await store.get(key,{type:'json',consistency:'strong'}).catch(()=>null);
  return value&&typeof value==='object'?{__sourceKey:key,...value}:null;
 }));
 return rows.filter(Boolean);
}

function sanitizeOrder(row={}){
 const items=Array.isArray(row.items)?row.items.slice(0,100).map((item,i)=>({
  id:text(item.id||item.sku||item.ref||item.code||`${row.order||row.id||'order'}-${i}`,120),
  sku:text(item.sku||item.ref||item.code||item.id,120)||null,
  name:text(item.name||item.nombre||item.title,160)||null,
  quantity:num(item.quantity??item.qty??item.cantidad)??0,
  unitPrice:num(item.unitPriceCents??item.priceCents??item.price??item.precio)
 })):[];
 return{
  id:text(row.id||row.order||row.__sourceKey,120),order:text(row.order||row.id||row.__sourceKey,120),status:text(row.status,50)||'UNKNOWN',
  fulfilmentStatus:text(row.fulfilmentStatus,50)||null,amount:num(row.amount??row.totalCents??row.total),currency:text(row.currency,10)||null,
  items,createdAt:row.createdAt||row.receivedAt||null,updatedAt:row.updatedAt||row.paidAt||row.createdAt||row.receivedAt||null,
  paidAt:row.paidAt||null,paymentMethod:text(row.paymentMethod,50)||null,carrier:text(row.tracking?.carrier||row.carrier,80)||null,
  amountMismatch:Boolean(row.amountMismatch),hasShipping:Boolean(row.envio||row.shipping),source:'redsys-orders'
 };
}

function sanitizeCustomer(row={}){
 const identity=row.id||row.email||row.__sourceKey;
 return{
  id:`customer_${hash(identity)}`,orders:num(row.orders??row.orderCount??row.totalOrders)??0,totalSpent:num(row.totalSpent??row.totalSpentCents)??0,
  marketingConsent:Boolean(row.marketingConsent??row.marketing??row.newsletter),createdAt:row.createdAt||null,
  updatedAt:row.updatedAt||row.lastOrderAt||row.createdAt||null,lastOrderAt:row.lastOrderAt||null,source:'auth-accounts'
 };
}

function catalogRows(){
 try{
  const data=require('../../products-data.js');
  const groups=['products','suplementos','basesSmoothie','capsulasCafe','siropesToppings'];
  const seen=new Set(),rows=[];
  for(const group of groups){for(const item of Array.isArray(data[group])?data[group]:[]){
   const rawId=item.id||item.sku||item.ref||item.code||item.ean||item.name||item.nombre;if(!rawId)continue;
   const id=text(rawId,140);if(seen.has(id))continue;seen.add(id);
   rows.push({id,sku:text(item.sku||item.ref||item.code||item.ean||item.id,140)||null,name:text(item.name||item.nombre||item.title,180)||null,
    category:text(item.category||item.categoria||group,100)||group,brand:text(item.brand||item.marca,100)||null,
    price:num(item.priceCents??item.price??item.precio),stock:num(item.stock),active:item.active!==false&&item.activo!==false,
    sourceGroup:group,source:'products-data.js'});
  }}
  return rows.slice(0,MAX_ROWS);
 }catch{return[]}
}

function inventoryRows(products=catalogRows()){
 return products.filter(x=>x.stock!==null).map(x=>({id:`inventory_${x.id}`,sku:x.sku||x.id,productId:x.id,onHand:x.stock,reserved:null,
  reorderPoint:null,reorderQty:null,status:x.active?'active':'inactive',source:'products-data.js'}));
}

async function analyticsRows(){
 const rows=await listJsonStore('analytics-daily',{limit:90});
 return rows.sort((a,b)=>String(b.__sourceKey||'').localeCompare(String(a.__sourceKey||''))).slice(0,31).map(row=>({
  id:text(row.id||row.date||row.__sourceKey,80),date:text(row.date||row.__sourceKey,32),updatedAt:row.updatedAt||row.generatedAt||(`${text(row.date||row.__sourceKey,10)}T23:59:59.000Z`),
  sessions:num(row.sessions),pageviews:num(row.pageviews),events:num(row.events??row.eventCount),orders:num(row.orders),revenue:num(row.revenue),
  conversions:num(row.conversions),raw:Object.fromEntries(Object.entries(row).filter(([k])=>!['__sourceKey','email','name','phone','address','ip','userAgent'].includes(k)).slice(0,80)),source:'analytics-daily'
 }));
}

async function enterpriseRows(collection){return enterprise.list(collection,{limit:MAX_ROWS}).catch(()=>[])}

const ENTERPRISE_COLLECTIONS=Object.freeze({
 suppliers:'suppliers','purchaseOrders':'purchase-orders',compliance:'compliance-records',productCompliance:'product-compliance',incidents:'incidents',
 systemIncidents:'system-incidents',shipments:'shipments',returns:'returns',reviews:'reviews',reconciliation:'reconciliation',invoices:'invoices',
 promotions:'promotions',experiments:'experiments',integrations:'integrations',automationRules:'automation-rules',staff:'staff-directory',priceHistory:'price-history',
 productCosts:'product-costs',marketplace:'marketplace-listings',subscriptions:'subscriptions',loyalty:'loyalty',crmTickets:'crm-tickets'
});

async function load(key){
 if(key==='orders')return(await listJsonStore('redsys-orders')).map(sanitizeOrder);
 if(key==='customers')return(await listJsonStore('auth-accounts')).map(sanitizeCustomer);
 if(key==='products')return catalogRows();
 if(key==='inventory')return inventoryRows();
 if(key==='analytics')return analyticsRows();
 const collection=ENTERPRISE_COLLECTIONS[key];return collection?enterpriseRows(collection):[];
}

function sourceDescriptor(key){
 if(key==='orders')return{kind:'live_blob',source:'redsys-orders',containsPII:false,sanitized:true};
 if(key==='customers')return{kind:'live_blob',source:'auth-accounts',containsPII:false,sanitized:true};
 if(key==='analytics')return{kind:'live_blob',source:'analytics-daily',containsPII:false,sanitized:true};
 if(key==='products'||key==='inventory')return{kind:'versioned_catalog',source:'products-data.js',containsPII:false,sanitized:true};
 return{kind:'enterprise_store',source:ENTERPRISE_COLLECTIONS[key]||key,containsPII:false,sanitized:true};
}

module.exports={MAX_ROWS,ENTERPRISE_COLLECTIONS,load,sourceDescriptor,sanitizeOrder,sanitizeCustomer,catalogRows,inventoryRows,analyticsRows,listJsonStore};
