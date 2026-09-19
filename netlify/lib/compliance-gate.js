'use strict';
const enterprise=require('./enterprise-store');

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
  const blocked=[];
  for(const item of items||[]){
    const sku=String(item.code||item.sku||'').trim().toUpperCase();
    const record=map.get(sku);
    if(record&&['blocked','rejected'].includes(record.status))blocked.push({sku,status:record.status,id:record.id});
  }
  return{ok:blocked.length===0,blocked};
}
module.exports={statuses,checkItems};
