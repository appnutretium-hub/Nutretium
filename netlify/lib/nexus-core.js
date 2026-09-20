'use strict';

const crypto = require('crypto');
const governance = require('./agent-governance');
const decisions = require('./ai-decision-engine');
const runtime = require('./ai-runtime');

const COMPONENT_VERSION = '1.0.0';
const FORBIDDEN_AI_ACTIONS = new Set([
  'self-permission-change','self-role-change','disable-audit','delete-audit','bypass-policy',
  'reveal-secret','export-secret','unbounded-spend','disable-guardian','disable-compliance-veto'
]);

const C = (id, domain, criticality, dependencies = [], capabilities = []) => Object.freeze({
  id, domain, criticality, dependencies:Object.freeze([...dependencies]), capabilities:Object.freeze([...capabilities]), status:'operational'
});

const COMPONENTS = Object.freeze([
  C('cognitive_core','intelligence','critical',['world_model','enterprise_memory','decision_engine','agent_mesh'],['observe','plan','coordinate','learn']),
  C('world_model','intelligence','high',['data_lakehouse','knowledge_graph','feature_store'],['business-state','dependency-state','scenario-context']),
  C('enterprise_memory','data','high',['truth_engine','audit_ledger'],['operational-memory','historical-memory','semantic-memory','learning-memory']),
  C('knowledge_graph','data','medium',['data_lakehouse'],['entity-relations','dependency-map','impact-map']),
  C('event_nervous_system','orchestration','critical',['audit_ledger','zero_trust'],['event-envelope','routing','subscriber-isolation']),
  C('workflow_engine','orchestration','critical',['event_nervous_system','decision_engine'],['deterministic-workflows','step-results','fail-closed']),
  C('agent_mesh','orchestration','critical',['agent_registry','policy_engine','ai_evaluator'],['department-routing','agent-routing','handoff-contracts']),
  C('commerce_brain','commerce','high',['ranking_engine','recommendation_engine','decision_engine'],['commerce-priorities','merchandising','conversion']),
  C('search_intelligence','commerce','medium',['feature_store','truth_engine'],['intent-contract','catalog-search','bounded-personalization']),
  C('ranking_engine','commerce','high',['feature_store','financial_governor'],['ranking-score','stock-aware-ranking','margin-guardrails']),
  C('recommendation_engine','commerce','high',['feature_store','truth_engine'],['cross-sell','upsell','availability-gate']),
  C('customer_brain','customer','high',['nutretium_id','truth_engine','zero_trust'],['consented-profile','journey-state','service-context']),
  C('clv_engine','customer','medium',['customer_brain','feature_store'],['recency','frequency','value-estimate']),
  C('growth_brain','growth','high',['experimentation_platform','truth_engine','financial_governor'],['growth-hypotheses','channel-priorities','measurement']),
  C('experimentation_platform','growth','high',['audit_ledger','feature_store'],['experiment-contracts','control-variant','success-criteria']),
  C('forecasting_engine','analytics','high',['feature_store','truth_engine'],['demand-forecast','coverage-forecast','uncertainty-labels']),
  C('digital_twin_simulator','analytics','medium',['world_model','forecasting_engine'],['scenario-simulation','bounded-delta','estimate-labeling']),
  C('supply_chain_brain','operations','high',['forecasting_engine','financial_governor','truth_engine'],['replenishment','supplier-risk','coverage']),
  C('marketplace_core','platform','medium',['commerce_brain','zero_trust'],['channel-contracts','listing-readiness','margin-gate']),
  C('seller_platform','platform','medium',['marketplace_core','audit_ledger'],['seller-contract','catalog-boundary','order-boundary']),
  C('fulfillment_engine','operations','high',['workflow_engine','supply_chain_brain'],['fulfillment-state','exception-routing','handoff']),
  C('nutretium_id','identity','critical',['zero_trust','audit_ledger'],['identity-boundary','session-context','consent-boundary']),
  C('wallet','finance','critical',['nutretium_id','financial_governor','audit_ledger'],['ledger-contract','balance-guard','human-approval']),
  C('membership','customer','medium',['nutretium_id','commerce_brain'],['benefit-contract','eligibility','entitlement']),
  C('guardian','reliability','critical',['ai_evaluator','audit_ledger','event_nervous_system'],['health-gate','containment','rollback-contract','incident-learning']),
  C('chaos_engine','reliability','high',['guardian','workflow_engine'],['staging-only','failure-injection-contract','blast-radius-gate']),
  C('cell_architecture','reliability','medium',['control_data_plane','guardian'],['cell-boundaries','blast-radius','cell-health']),
  C('multi_region_readiness','reliability','medium',['cell_architecture','evolutionary_architecture'],['region-contract','failover-readiness','data-residency-gate']),
  C('data_lakehouse','data','high',['zero_trust','audit_ledger'],['operational-contract','analytical-contract','lineage']),
  C('feature_store','data','high',['data_lakehouse','truth_engine'],['feature-definitions','numeric-sanitization','reusable-features']),
  C('model_router','intelligence','high',['financial_governor','zero_trust'],['deterministic-first','approved-provider-only','cost-gate']),
  C('ai_evaluator','intelligence','critical',['truth_engine','policy_engine'],['output-validation','secret-detection','approval-check']),
  C('truth_engine','governance','critical',['audit_ledger'],['fact-inference-separation','source-gate','no-validation-no-fact']),
  C('decision_engine','governance','critical',['truth_engine','policy_engine','financial_governor'],['risk-tier','vetoes','approval-contract']),
  C('financial_governor','governance','critical',['audit_ledger'],['budget-envelope','impact-gate','no-unbounded-spend']),
  C('agent_registry','governance','critical',['zero_trust'],['agent-identity','scopes','sensitive-actions']),
  C('audit_ledger','governance','critical',[],['append-contract','traceability','actor-action-resource']),
  C('zero_trust','security','critical',['audit_ledger'],['deny-by-default','least-privilege','no-self-escalation']),
  C('control_data_plane','architecture','critical',['zero_trust','audit_ledger'],['control-isolation','commerce-survives-ai-outage','explicit-contracts']),
  C('evolutionary_architecture','architecture','high',['control_data_plane'],['modular-monolith-first','service-extraction-contract','backward-compatible-evolution'])
]);

// El Policy Engine reutiliza agent-governance: no se duplica como un servicio 41.
const POLICY_COMPONENT = Object.freeze({id:'policy_engine', status:'embedded', implementation:'agent-governance'});
const COMPONENT_MAP = Object.freeze(Object.fromEntries(COMPONENTS.map(x => [x.id, x])));

const EVENT_ROUTES = Object.freeze({
  'order.created':['commerce_brain','fulfillment_engine','supply_chain_brain','growth_brain'],
  'order.completed':['commerce_brain','clv_engine','forecasting_engine','financial_governor'],
  'stock.low':['supply_chain_brain','forecasting_engine','commerce_brain'],
  'payment.failed':['financial_governor','guardian','customer_brain'],
  'deploy.failed':['guardian','chaos_engine'],
  'agent.action.requested':['decision_engine','ai_evaluator','audit_ledger'],
  'experiment.completed':['growth_brain','enterprise_memory','feature_store'],
  'compliance.blocked':['commerce_brain','supply_chain_brain','guardian']
});

function componentRegistry(){
  return COMPONENTS.map(x => ({...x,dependencies:[...x.dependencies],capabilities:[...x.capabilities]}));
}

function validateArchitecture(){
  const errors=[];
  if(COMPONENTS.length!==40)errors.push(`Se esperaban 40 componentes y hay ${COMPONENTS.length}.`);
  const ids=new Set();
  for(const c of COMPONENTS){
    if(ids.has(c.id))errors.push(`Componente duplicado: ${c.id}`);
    ids.add(c.id);
    for(const dep of c.dependencies){
      if(dep==='policy_engine')continue;
      if(!COMPONENT_MAP[dep])errors.push(`Dependencia inexistente: ${c.id} -> ${dep}`);
    }
  }
  for(const [event,targets] of Object.entries(EVENT_ROUTES))for(const target of targets)if(!COMPONENT_MAP[target])errors.push(`Ruta ${event} apunta a ${target} inexistente.`);
  const agentCount=Object.keys(governance.AGENTS||{}).length;
  if(agentCount<35)errors.push(`Plantilla de agentes incompleta: ${agentCount}.`);
  return {ok:errors.length===0,version:COMPONENT_VERSION,components:COMPONENTS.length,agents:agentCount,errors};
}

function architectureGraph(){return Object.fromEntries(COMPONENTS.map(c=>[c.id,[...c.dependencies]]));}

function createEvent(type,payload={},meta={}){
  const name=String(type||'').trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(name))throw new Error('Tipo de evento no válido.');
  if(payload===null||Array.isArray(payload)||typeof payload!=='object')throw new Error('El payload del evento debe ser un objeto.');
  const source=String(meta.source||'nutretium').trim().slice(0,80)||'nutretium';
  return Object.freeze({id:crypto.randomUUID(),type:name,version:1,occurredAt:new Date().toISOString(),source,correlationId:String(meta.correlationId||crypto.randomUUID()).slice(0,120),payload:Object.freeze({...payload})});
}

function routeEvent(type){return [...(EVENT_ROUTES[String(type||'').toLowerCase()]||[])];}

class NexusEventBus{
  constructor(){this.listeners=new Map();}
  subscribe(type,handler){
    if(typeof handler!=='function')throw new Error('El subscriber debe ser una función.');
    const name=String(type||'').toLowerCase(),set=this.listeners.get(name)||new Set();set.add(handler);this.listeners.set(name,set);
    return()=>set.delete(handler);
  }
  async publish(type,payload={},meta={}){
    const event=createEvent(type,payload,meta),handlers=[...(this.listeners.get(event.type)||[])],results=[];
    for(const handler of handlers){
      try{results.push({ok:true,value:await handler(event)});}catch(error){results.push({ok:false,error:String(error?.message||error).slice(0,500)});}
    }
    return {event,targets:routeEvent(event.type),delivered:handlers.length,results};
  }
}

async function executeWorkflow({name,steps,context={},handlers={}}={}){
  const workflow=String(name||'').trim();
  if(!workflow)throw new Error('Workflow sin nombre.');
  if(!Array.isArray(steps)||!steps.length)throw new Error('Workflow sin pasos.');
  const output={name:workflow,status:'running',startedAt:new Date().toISOString(),steps:[]};
  let state={...context};
  for(const raw of steps){
    const step=typeof raw==='string'?raw:String(raw?.id||'');
    if(!step||typeof handlers[step]!=='function')throw new Error(`Handler de workflow ausente: ${step||'(vacío)'}.`);
    const startedAt=new Date().toISOString();
    try{
      const result=await handlers[step](Object.freeze({...state}));
      if(result&&typeof result==='object'&&!Array.isArray(result))state={...state,...result};
      output.steps.push({step,status:'completed',startedAt,completedAt:new Date().toISOString()});
    }catch(error){
      output.steps.push({step,status:'failed',startedAt,failedAt:new Date().toISOString(),error:String(error?.message||error).slice(0,500)});
      output.status='failed';output.completedAt=new Date().toISOString();output.state=state;return output;
    }
  }
  output.status='completed';output.completedAt=new Date().toISOString();output.state=state;return output;
}

function worldModel(snapshot){
  if(!snapshot||typeof snapshot!=='object')throw new Error('Snapshot empresarial requerido.');
  return Object.freeze({generatedAt:new Date().toISOString(),sourceGeneratedAt:snapshot.generatedAt||null,business:runtime.businessView(snapshot),architecture:{components:40,agents:Object.keys(governance.AGENTS||{}).length}});
}

function featureVector(view={}){
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  return Object.freeze({
    orders:num(view?.orders?.records),lowStock:num(view?.inventory?.lowStock),negativeStock:num(view?.inventory?.negativeAvailable),
    catalog:num(view?.catalog?.records),complianceBlocked:num(view?.compliance?.blocked),compliancePending:num(view?.compliance?.pending),
    suppliers:num(view?.suppliers?.records),incidents:num(view?.operations?.incidents?.records),analyticsRecords:num(view?.digital?.analyticsRecords)
  });
}

function financialEnvelope({estimatedImpactCents=0,approvedLimitCents=0,approved=false}={}){
  const impact=Math.abs(Number(estimatedImpactCents)||0),limit=Math.max(0,Number(approvedLimitCents)||0);
  const within=impact<=limit;
  return Object.freeze({estimatedImpactCents:impact,approvedLimitCents:limit,approved:Boolean(approved),withinBudget:within,canExecute:Boolean(approved)&&within});
}

function riskTierForAction(agent,action){
  const normalized=String(action||'').trim().toLowerCase();
  if(FORBIDDEN_AI_ACTIONS.has(normalized))return 'R5';
  const p=governance.policy(agent,action);
  if(!p.allowed)return 'R5';
  if(p.sensitive)return 'R4';
  if(p.requiresApproval)return 'R3';
  if(p.autonomous)return 'R1';
  return 'R2';
}

function guardedAssessment({agent,action,snapshot={sources:{}},requiredSources=[],estimatedImpactEur=0,approvals=[]}={}){
  const normalized=String(action||'').trim().toLowerCase();
  if(FORBIDDEN_AI_ACTIONS.has(normalized))return {allowed:false,decision:'BLOCKED',riskTier:'R5',reason:'Acción permanentemente prohibida para IA.',canExecute:false};
  const assessment=decisions.assess({agent,action,snapshot,requiredSources,estimatedImpactEur});
  return {...assessment,riskTier:riskTierForAction(agent,action),canExecute:decisions.canExecute(assessment,approvals)};
}

const SECRET_PATTERNS=[/(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,/sk-[A-Za-z0-9_-]{16,}/];
function evaluateOutput(output){
  const text=typeof output==='string'?output:JSON.stringify(output??{}),findings=[];
  if(SECRET_PATTERNS.some(r=>r.test(text)))findings.push('POTENTIAL_SECRET_EXPOSURE');
  const obj=output&&typeof output==='object'?output:null;
  if(obj?.validation==='NO_VALIDADO'&&Array.isArray(obj.facts)&&obj.facts.length)findings.push('UNVALIDATED_FACTS_PRESENT');
  if(obj?.requiresHumanDecision===true&&obj?.decision?.decision==='AUTO')findings.push('APPROVAL_CONTRADICTION');
  return {ok:findings.length===0,findings};
}

function selectModel(task={},env=process.env){
  const cfg=runtime.providerConfig(env),complexity=String(task.complexity||'low').toLowerCase();
  if(cfg.mode==='deterministic')return {route:'deterministic',externalSpendLimitEur:0,reason:'Provider determinista configurado.'};
  return {route:'ollama_gateway',model:cfg.model,endpoint:cfg.endpoint?'configured':null,externalSpendLimitEur:0,reason:complexity==='low'?'Gateway local permitido; tarea acotada.':'Gateway local permitido; mantener evaluación y Truth Layer.'};
}

function simulateScenario({baseline={},changes={}}={}){
  const result={};
  for(const [key,value] of Object.entries(baseline)){
    const base=Number(value);if(!Number.isFinite(base))continue;
    const delta=Number(changes[key]||0);result[key]=Number.isFinite(delta)?base+delta:base;
  }
  return {type:'ESTIMACION',model:'bounded-delta-v1',baseline:{...baseline},changes:{...changes},result,warning:'Escenario matemático; no es una predicción ni un hecho.'};
}

function systemStatus(){
  const validation=validateArchitecture(),byDomain={};for(const c of COMPONENTS)(byDomain[c.domain]??=[]).push(c.id);
  return {
    name:'Nutretium Nexus',version:COMPONENT_VERSION,status:validation.ok?'operational':'degraded',validation,
    components:{total:COMPONENTS.length,operational:COMPONENTS.filter(c=>c.status==='operational').length,byDomain},
    agents:Object.keys(governance.AGENTS||{}).length,policyEngine:POLICY_COMPONENT,
    safety:{forbiddenAIActions:[...FORBIDDEN_AI_ACTIONS],externalAISpendLimitEur:0,controlDataPlaneSeparated:true,failClosed:true}
  };
}

module.exports={
  COMPONENT_VERSION,COMPONENTS,COMPONENT_MAP,EVENT_ROUTES,FORBIDDEN_AI_ACTIONS,POLICY_COMPONENT,
  componentRegistry,validateArchitecture,architectureGraph,createEvent,routeEvent,NexusEventBus,executeWorkflow,
  worldModel,featureVector,financialEnvelope,riskTierForAction,guardedAssessment,evaluateOutput,selectModel,simulateScenario,systemStatus
};