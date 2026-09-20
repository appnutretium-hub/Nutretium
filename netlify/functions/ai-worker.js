'use strict';

const runtime=require('../lib/ai-runtime');

const RUNS=[
 ['director','daily-brief'],
 ['inventory','low-stock-scan'],
 ['compliance','documentation-gap-scan'],
 ['security','audit-scan'],
 ['sales','trend-scan'],
];

exports.handler=async function(){
 const results=[];
 for(const [agent,action] of RUNS){
  try{const record=await runtime.saveRun({agent,action,requestedBy:'scheduled-worker'});results.push({agent,action,status:'completed',id:record.id})}
  catch(error){results.push({agent,action,status:'failed',error:String(error.message||error).slice(0,300),runId:error.runId||null})}
 }
 const failed=results.filter(x=>x.status==='failed').length;
 return{statusCode:failed===RUNS.length?500:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:failed===0,partial:failed>0&&failed<RUNS.length,externalSpendLimitEur:0,results})};
};

exports._test={RUNS};
