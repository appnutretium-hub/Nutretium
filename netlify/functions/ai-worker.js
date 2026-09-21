'use strict';

const runtime=require('../lib/ai-runtime');
const growth=require('../lib/ai-growth-loop');
const federation=require('../lib/federated-ai-router');

exports.handler=async function(){
 try{
  const portfolio=await runtime.savePortfolio({requestedBy:'scheduled-worker'});
  const failed=portfolio.results.filter(x=>x.status==='failed').length;
  const view=await runtime.businessSnapshot();
  const growthLoop=await growth.run({view,requestedBy:'scheduled-ai-worker'});

  const enabled=federation.available().filter(x=>x.enabled);
  let federationCouncil={status:'SKIPPED_INSUFFICIENT_FREE_QUORUM',enabledProviders:enabled.map(x=>x.id),requiredProviders:2,externalSpendLimitEur:0};
  if(enabled.length>=2){
    const priorities=[...growthLoop.risks,...growthLoop.recommendations].slice(0,12);
    federationCouncil=await federation.query({
      question:'Contrasta estas prioridades de crecimiento de Nutretium. Identifica contradicciones, riesgos y mejoras. No conviertas consenso entre modelos en hecho y no propongas acciones críticas autónomas.',
      task:'daily-growth-council',
      context:{...view,operations:{...(view.operations||{}),growthPriorities:priorities}},
      minModels:2,
      maxModels:Math.min(3,enabled.length),
      learn:true,
    });
  }

  return{statusCode:failed===portfolio.results.length?500:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:failed===0,partial:failed>0&&failed<portfolio.results.length,agents:portfolio.results.length,failed,dataQuality:portfolio.dataQuality,externalSpendLimitEur:0,growthLoop,federationCouncil,results:portfolio.results})};
 }catch(error){
  console.error('[ai-worker]',error);
  return{statusCode:500,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:false,error:'ai_portfolio_failed',message:String(error.message||error).slice(0,300),externalSpendLimitEur:0})};
 }
};
exports._test={RUNS:runtime.PORTFOLIO_RUNS};
