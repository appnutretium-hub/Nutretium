'use strict';

const runtime=require('../lib/ai-runtime');

exports.handler=async function(){
 try{
  const portfolio=await runtime.savePortfolio({requestedBy:'scheduled-worker'});
  const failed=portfolio.results.filter(x=>x.status==='failed').length;
  return{statusCode:failed===portfolio.results.length?500:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:failed===0,partial:failed>0&&failed<portfolio.results.length,agents:portfolio.results.length,failed,dataQuality:portfolio.dataQuality,externalSpendLimitEur:0,results:portfolio.results})};
 }catch(error){
  console.error('[ai-worker]',error);
  return{statusCode:500,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:false,error:'ai_portfolio_failed',message:String(error.message||error).slice(0,300),externalSpendLimitEur:0})};
 }
};
exports._test={RUNS:runtime.PORTFOLIO_RUNS};
