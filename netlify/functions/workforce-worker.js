'use strict';

const runtime=require('../lib/enterprise-workforce-runtime');
const safeBridge=require('../lib/agent-safe-memory-bridge');

exports.handler=async function(){
  try{
    const cycle=await runtime.runScheduledCycle({requestedBy:'scheduled-workforce-worker'});
    const checkpoints=[];
    for(const row of cycle.results||[]){
      if(!row?.id)continue;
      try{checkpoints.push({roleId:row.roleId,runId:row.id,...await safeBridge.promoteRunById(row.id,{requestedBy:'scheduled-workforce-worker'})});}
      catch(error){checkpoints.push({roleId:row.roleId,runId:row.id,promoted:false,status:'checkpoint_error',error:String(error.message||error).slice(0,300)});}
    }
    const promoted=checkpoints.filter(x=>x.promoted).length;
    return{statusCode:cycle.failed===cycle.executed?500:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:cycle.failed===0,partial:cycle.failed>0&&cycle.failed<cycle.executed,...cycle,checkpointPromotions:{attempted:checkpoints.length,promoted,results:checkpoints}})};
  }catch(error){
    console.error('[workforce-worker]',error);
    return{statusCode:500,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:false,error:'workforce_cycle_failed',message:String(error.message||error).slice(0,300)})};
  }
};
