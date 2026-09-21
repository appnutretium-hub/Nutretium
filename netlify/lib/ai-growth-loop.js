'use strict';

const crypto=require('crypto');
const memory=require('./ai-memory');

const SYSTEM_AGENT='growth_loop';
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const sourceOk=(view,key)=>Boolean(view?.sources?.[key]&&view.sources[key].status!=='NO_VALIDADO');

function evaluate(view={}){
  const recommendations=[];
  const risks=[];
  const evidence=[];

  if(sourceOk(view,'inventory')){
    evidence.push('inventory');
    if(n(view?.inventory?.negativeAvailable)>0)risks.push({priority:'CRITICA',area:'stock',message:`Hay ${n(view.inventory.negativeAvailable)} referencias con disponible negativo. Revisar reservas y movimientos antes de comprar.`});
    if(n(view?.inventory?.lowStock)>0)recommendations.push({priority:'ALTA',area:'stock',message:`Revisar reposición de ${n(view.inventory.lowStock)} referencias en/bajo punto de pedido, contrastando demanda y proveedor antes de aprobar compra.`});
  }
  if(sourceOk(view,'products')){
    evidence.push('products');
    if(n(view?.catalog?.missingPrice)>0)risks.push({priority:'ALTA',area:'catalogo',message:`Hay ${n(view.catalog.missingPrice)} productos sin precio numérico validado; no deben publicarse para compra hasta corregirlos.`});
    if(n(view?.catalog?.inactive)>0)recommendations.push({priority:'MEDIA',area:'catalogo',message:`Revisar ${n(view.catalog.inactive)} productos inactivos para decidir si reactivar, sustituir o retirar del surtido.`});
  }
  if(sourceOk(view,'productCompliance')||sourceOk(view,'compliance')){
    evidence.push('productCompliance','compliance');
    if(n(view?.compliance?.blocked)>0)risks.push({priority:'CRITICA',area:'food_safety',message:`Hay ${n(view.compliance.blocked)} expedientes bloqueados; mantener veto de venta/claim hasta resolver evidencia.`});
    if(n(view?.compliance?.pending)>0)recommendations.push({priority:'ALTA',area:'food_safety',message:`Priorizar cierre documental de ${n(view.compliance.pending)} expedientes pendientes antes de ampliar catálogo.`});
  }
  if(sourceOk(view,'orders')){
    evidence.push('orders');
    if(n(view?.orders?.records)>0)recommendations.push({priority:'MEDIA',area:'ventas',message:'Usar pedidos fechados para identificar repetición, mix y franjas; no inferir beneficio sin costes/conciliación.'});
  }
  if(sourceOk(view,'analytics')){
    evidence.push('analytics');
    if(n(view?.digital?.analyticsRecords)>0)recommendations.push({priority:'MEDIA',area:'growth',message:'Cruzar analítica digital con pedidos para detectar fugas de conversión y proponer experimentos medibles.'});
  }else{
    recommendations.push({priority:'ALTA',area:'datos',message:'Analítica digital NO VALIDADA: conectar/actualizar una fuente trazable antes de optimizar adquisición o conversión.'});
  }
  if(sourceOk(view,'reviews')){
    evidence.push('reviews');
    if(n(view?.customer?.reviews?.attention)>0)recommendations.push({priority:'MEDIA',area:'cliente',message:`Revisar ${n(view.customer.reviews.attention)} registros de reseñas/casos abiertos para convertir fricciones repetidas en mejoras.`});
  }

  const coverage=n(view?.dataQuality?.coveragePct);
  const validation=coverage>=60?'PARCIALMENTE_VALIDADO':'NO_VALIDADO';
  if(coverage<60)risks.push({priority:'ALTA',area:'datos',message:`Cobertura útil de fuentes ${coverage}%. No convertir recomendaciones de crecimiento en hechos hasta mejorar cobertura.`});

  return{
    id:crypto.randomUUID(),generatedAt:new Date().toISOString(),validation,coveragePct:coverage,
    evidence:[...new Set(evidence)],risks,recommendations,
    rules:'Deterministic only; no paid AI; no autonomous critical actions.'
  };
}

async function run({view,requestedBy='scheduled-ai-worker'}={}){
  const result=evaluate(view||{});
  await memory.remember({type:'learning',agent:SYSTEM_AGENT,subject:'daily-growth-loop',content:JSON.stringify({validation:result.validation,coveragePct:result.coveragePct,risks:result.risks,recommendations:result.recommendations}),evidence:result.evidence,confidence:result.validation==='PARCIALMENTE_VALIDADO'?'medium':'low',outcome:'recommendations-only'}).catch(()=>{});
  return{...result,requestedBy};
}

module.exports={SYSTEM_AGENT,evaluate,run};
