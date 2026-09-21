'use strict';
const enterprise=require('./enterprise-store');
const security=require('./security-policy');

function yes(value){return String(value||'').trim().toLowerCase()==='true'}
function strictRequired(){return security.productionLike()||yes(process.env.REQUIRE_PRODUCT_COMPLIANCE)}
function exemptSkus(){return new Set(String(process.env.COMPLIANCE_EXEMPT_SKUS||'').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean))}

async function statuses(){
  try{
    const rows=await enterprise.list('product-compliance',{limit:1000});
    const map=new Map();
    for(const row of rows){
      const sku=String(row.sku||'').trim().toUpperCase();
      if(!sku||row.archivedAt)continue;
      const market=String(row.market||'').trim().toUpperCase();
      if(market&&market!=='ES'&&market!=='EU')continue;
      const prior=map.get(sku);
      const rank={blocked:5,rejected:4,under_review:3,draft:2,approved:1};
      if(!prior||Number(rank[row.status]||0)>Number(rank[prior.status]||0))map.set(sku,row);
    }
    return map;
  }catch{return new Map();}
}
async function checkItems(items){
  const map=await statuses();
  const blocked=[],strict=strictRequired(),exempt=exemptSkus();
  for(const item of items||[]){
    const sku=String(item.code||item.sku||'').trim().toUpperCase();
    const record=map.get(sku);
    if(exempt.has(sku))continue;
    if(record&&['blocked','rejected'].includes(record.status)){blocked.push({sku,status:record.status,id:record.id,reason:'explicitly-blocked'});continue}
    if(strict&&(!record||record.status!=='approved'||record.evidenceComplete!==true||!Array.isArray(record.evidence)||record.evidence.length===0))blocked.push({sku,status:record?.status||'missing',id:record?.id||null,reason:'approval-and-evidence-required'});
  }
  return{ok:blocked.length===0,blocked,strict};
}
module.exports={statuses,checkItems,strictRequired,exemptSkus};
