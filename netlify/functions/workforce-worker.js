'use strict';

const runtime=require('../lib/enterprise-workforce-runtime');
const safeBridge=require('../lib/agent-safe-memory-bridge');
const lifecycle=require('../lib/agent-memory-lifecycle');

exports.handler=async function(){
  const started=Date.now(),hardBudgetMs=27000;
  try{
    const cycle=await runtime.runScheduledCycle({requestedBy:'scheduled-workforce-worker'});
    const checkpoints=[];
    for(const row of cycle.results||[]){
      if(Date.now()-started>=hardBudgetMs){checkpoints.push({roleId:row?.roleId||null,runId:row?.id||null,promoted:false,status:'budget_stop'});break;}
      if(!row?.id)continue;
      try{checkpoints.push({roleId:row.roleId,runId:row.id,...await safeBridge.promoteRunById(row.id,{requestedBy:'scheduled-workforce-worker'})});}
      catch(error){checkpoints.push({roleId:row.roleId,runId:row.id,promoted:false,status:'checkpoint_error',error:String(error.message||error).slice(0,300)});}
    }
    const promoted=checkpoints.filter(x=>x.promoted).length;
    let recoveryDrill=null;
    const candidate=checkpoints.find(x=>x.promoted&&x.roleId);
    if(candidate&&Date.now()-started<hardBudgetMs){
      try{recoveryDrill=await lifecycle.recoveryDrill(`workforce__${candidate.roleId}`);}
      catch(error){recoveryDrill={ok:false,status:'DRILL_ERROR',error:String(error.message||error).slice(0,300)};}
    }
    const elapsedMs=Date.now()-started,budgetStopped=checkpoints.some(x=>x.status==='budget_stop');
    return{statusCode:cycle.failed===cycle.executed?500:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:cycle.failed===0&&!budgetStopped,partial:cycle.failed>0||budgetStopped,...cycle,workerBudget:{hardBudgetMs,elapsedMs,budgetStopped},checkpointPromotions:{attempted:checkpoints.length,promoted,results:checkpoints},recoveryDrill})};
  }catch(error){
    console.error('[workforce-worker]',error);
    return{statusCode:500,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:false,error:'workforce_cycle_failed',message:String(error.message||error).slice(0,300),elapsedMs:Date.now()-started})};
  }
};
