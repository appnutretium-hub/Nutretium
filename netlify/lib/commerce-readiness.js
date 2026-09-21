'use strict';
const {NUTRETIUM_PRODUCTS=[]}=require('../../products-data.js');
const compliance=require('./compliance-gate');
const {FactusolCommerce}=require('./factusol-commerce');

function activeProducts(products=NUTRETIUM_PRODUCTS){return(Array.isArray(products)?products:[]).filter(item=>item&&item.active!==false)}
function catalogState(products=NUTRETIUM_PRODUCTS){
 const active=activeProducts(products),seen=new Set(),duplicates=new Set();
 for(const item of active){const code=String(item.code||item.sku||'').trim().toUpperCase();if(code&&seen.has(code))duplicates.add(code);if(code)seen.add(code)}
 const missingSku=active.filter(item=>!String(item.code||item.sku||'').trim()).length;
 const missingName=active.filter(item=>!String(item.name||'').trim()).length;
 const invalidPrice=active.filter(item=>!Number.isFinite(Number(item.price))||Number(item.price)<=0).length;
 const missingImage=active.filter(item=>!String(item.image||'').trim()).length;
 const unknownStock=active.filter(item=>item.stock===null||item.stock===undefined).length;
 const missingDescription=active.filter(item=>!String(item.description||'').trim()).length;
 const ready=active.length>0&&missingSku===0&&missingName===0&&invalidPrice===0&&duplicates.size===0;
 return{ready,active:active.length,missingSku,missingName,invalidPrice,duplicateSku:duplicates.size,missingImage,unknownStock,missingDescription,presentationReady:ready&&missingImage===0&&missingDescription===0};
}
async function complianceState(products=NUTRETIUM_PRODUCTS){
 const active=activeProducts(products);
 try{
  const result=await compliance.checkItems(active.map(item=>({code:item.code||item.sku})));
  return{ready:result.strict===true&&result.ok===true,strict:result.strict===true,blocked:result.blocked.length,reason:result.strict!==true?'strict-gate-disabled':result.ok?'approved':'missing-approval-or-evidence'};
 }catch(error){
  return{ready:false,strict:compliance.strictRequired(),blocked:active.length,reason:'compliance-check-failed',error:String(error.message||error).slice(0,120)};
 }
}
async function factusolState({probe=true}={}){
 let service;
 try{service=await FactusolCommerce.create()}catch(error){return{ready:false,configured:false,connected:false,reason:'initialization-failed',error:String(error.message||error).slice(0,120)}}
 const configuration=service.readiness();
 if(!configuration.liveCatalogReady)return{ready:false,configured:configuration.ready===true,connected:false,reason:'live-catalog-not-ready',exercise:configuration.exercise||null,liveEnabled:configuration.liveEnabled===true,warehouseCodesConfigured:configuration.warehouseCodesConfigured===true,tariffConfigured:configuration.tariffConfigured===true};
 if(!probe)return{ready:false,configured:true,connected:false,reason:'connection-not-probed',exercise:configuration.exercise,liveEnabled:true,warehouseCodesConfigured:true,tariffConfigured:true};
 try{
  const health=await service.client.health();
  return{ready:health.ok===true,configured:true,connected:health.ok===true,reason:health.ok===true?'connected':'health-failed',exercise:configuration.exercise,liveEnabled:true,warehouseCodesConfigured:true,tariffConfigured:true,latencyMs:health.latencyMs};
 }catch(error){
  return{ready:false,configured:true,connected:false,reason:'connection-failed',exercise:configuration.exercise,liveEnabled:true,warehouseCodesConfigured:true,tariffConfigured:true,error:String(error.message||error).slice(0,120)};
 }
}
async function assessCommerceDependencies({products=NUTRETIUM_PRODUCTS,probeFactusol=true}={}){
 const catalog=catalogState(products);
 const [productCompliance,factusol]=await Promise.all([complianceState(products),factusolState({probe:probeFactusol})]);
 return{ready:catalog.ready&&productCompliance.ready&&factusol.ready,catalog,compliance:productCompliance,factusol};
}
module.exports={activeProducts,catalogState,complianceState,factusolState,assessCommerceDependencies};
