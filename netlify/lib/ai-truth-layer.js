'use strict';

const live=require('./ai-live-sources');
const MAX_ROWS=1000;
const SOURCES=Object.freeze({
 inventory:'inventory',orders:'orders',products:'products',suppliers:'suppliers',purchaseOrders:'purchaseOrders',
 compliance:'compliance',productCompliance:'productCompliance',incidents:'incidents',systemIncidents:'systemIncidents',
 shipments:'shipments',returns:'returns',customers:'customers',reviews:'reviews',analytics:'analytics',
 reconciliation:'reconciliation',invoices:'invoices',promotions:'promotions',experiments:'experiments',integrations:'integrations',
 automationRules:'automationRules',staff:'staff',priceHistory:'priceHistory',productCosts:'productCosts',
 marketplace:'marketplace',subscriptions:'subscriptions',loyalty:'loyalty',crmTickets:'crmTickets'
});
const iso=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null};
const now=()=>Date.now();

function freshness(rows){
 const dates=rows.map(x=>iso(x.updatedAt||x.createdAt||x.at||x.timestamp||x.date)).filter(Boolean).map(Date.parse);
 if(!dates.length)return{status:'NO_VALIDADO',latestAt:null,ageHours:null};
 const latest=Math.max(...dates),ageHours=Math.max(0,(now()-latest)/3600000);
 return{status:ageHours<=24?'FRESH':ageHours<=168?'AGING':'STALE',latestAt:new Date(latest).toISOString(),ageHours:Number(ageHours.toFixed(1))};
}
function quality(name,rows,descriptor=live.sourceDescriptor(name)){
 const count=rows.length,withId=rows.filter(x=>x&&x.id).length;
 const f=freshness(rows);let score=0;
 if(count)score+=40;
 if(count&&withId/count>=.95)score+=25;
 if(f.status==='FRESH')score+=35;else if(f.status==='AGING')score+=20;else if(f.status==='STALE')score+=5;
 if((name==='products'||name==='inventory')&&count&&f.status==='NO_VALIDADO')score+=20;
 const status=score>=80?'VERIFICADO':score>=50?'PARCIAL':'NO_VALIDADO';
 return{source:name,records:count,idCompleteness:count?Number((withId/count*100).toFixed(1)):0,freshness:f,score,status,...descriptor};
}
function fact(value,source,status='VERIFICADO',evidence={}){return{type:'DATO',value,source,status,evidence}}
function inference(value,sources=[],confidence='MEDIA'){return{type:'INFERENCIA',value,sources,confidence}}
function estimate(value,method,sources=[],confidence='BAJA'){return{type:'ESTIMACION',value,method,sources,confidence}}
function recommendation(value,basis=[],risk='BAJO'){return{type:'RECOMENDACION',value,basis,risk}}

async function snapshot(){
 const keys=Object.keys(SOURCES),values=await Promise.all(keys.map(k=>live.load(SOURCES[k]).catch(()=>[])));
 const data={},sources={};
 keys.forEach((key,i)=>{data[key]=values[i].slice(0,MAX_ROWS);sources[key]=quality(key,data[key])});
 const usable=Object.values(sources).filter(x=>x.status!=='NO_VALIDADO').length;
 return{generatedAt:new Date().toISOString(),sources,data,quality:{sources:keys.length,usable,coveragePct:Number((usable/keys.length*100).toFixed(1)),status:usable>=Math.ceil(keys.length*.6)?'PARCIALMENTE_VALIDADO':'NO_VALIDADO'}};
}

function sourceGate(snapshot,required=[]){
 const missing=required.filter(k=>!snapshot.sources[k]||snapshot.sources[k].status==='NO_VALIDADO');
 return{ok:missing.length===0,missing,status:missing.length?'NO_VALIDADO':'VALIDADO'};
}
module.exports={SOURCES,COLLECTIONS:SOURCES,snapshot,quality,freshness,fact,inference,estimate,recommendation,sourceGate};
