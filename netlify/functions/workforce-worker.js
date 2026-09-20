'use strict';

const runtime=require('../lib/enterprise-workforce-runtime');

exports.handler=async function(){
  try{
    const cycle=await runtime.runScheduledCycle({requestedBy:'scheduled-workforce-worker'});
    return{statusCode:cycle.failed===cycle.executed?500:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:cycle.failed===0,partial:cycle.failed>0&&cycle.failed<cycle.executed,...cycle})};
  }catch(error){
    console.error('[workforce-worker]',error);
    return{statusCode:500,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:false,error:'workforce_cycle_failed',message:String(error.message||error).slice(0,300)})};
  }
};
