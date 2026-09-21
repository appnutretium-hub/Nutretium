'use strict';

const crypto=require('crypto');
const enterprise=require('./enterprise-store');
const governance=require('./agent-governance');
const truth=require('./ai-truth-layer');
const baseRuntime=require('./ai-runtime');
const zeroCost=require('./zero-cost-policy');

const SYSTEM={email:'enterprise-workforce@nutretium.local',role:'system'};

const FAMILY_REQUIRED_SOURCES=Object.freeze({
  executive:['orders','inventory','products'],strategy:['orders','products'],finance:['orders','invoices','reconciliation'],people:['staff'],
  legal_risk:['compliance','purchaseOrders'],technology:['systemIncidents','integrations'],data_ai:['analytics'],product:['products','orders','productCompliance'],
  sales:['orders','products'],marketing:['orders','analytics'],customer:['orders','reviews','crmTickets'],supply:['inventory','orders','suppliers','purchaseOrders'],
  operations:['incidents','orders'],digital:['products','orders','analytics'],security:['systemIncidents','integrations'],quality:['productCompliance','compliance','suppliers'],
  expansion:['orders','products'],esg:['inventory','suppliers']
});

const FAMILY_CONTEXT=Object.freeze({
  executive:['orders','inventory','catalog','compliance','operations','finance'],strategy:['orders','catalog','digital'],finance:['orders','finance','purchasing'],people:['operations'],
  legal_risk:['compliance','purchasing','operations'],technology:['operations','digital'],data_ai:['digital','orders','inventory','catalog'],product:['catalog','orders','compliance','inventory'],
  sales:['orders','catalog','digital'],marketing:['orders','digital','catalog'],customer:['customer','orders','returns'],supply:['inventory','suppliers','purchasing','logistics','orders'],
  operations:['operations','orders','inventory','logistics'],digital:['digital','catalog','orders'],security:['operations'],quality:['compliance','suppliers','inventory'],
  expansion:['orders','catalog','operations'],esg:['inventory','suppliers','operations']
});

const roleId=v=>String(v||'').trim().toLowerCase().replace(/^workforce__/,'');
const workforceAgent=id=>`workforce__${roleId(id)}`;
function workforce(){return governance.workforce;}
function getRole(id){return workforce().getRole(roleId(id));}
function requiredSourcesForRole(id){const r=getRole(id);return r?[...(FAMILY_REQUIRED_SOURCES[r.family]||[])]:[];}
function defaultActionForRole(id){const r=getRole(id);if(!r)return null;return r.autonomous.find(a=>!workforce().FORBIDDEN_AUTONOMY.has(a))||null;}
function contextForRole(id,view){const r=getRole(id);if(!r)return{};const keys=FAMILY_CONTEXT[r.family]||[];return Object.fromEntries(keys.filter(k=>Object.prototype.hasOwnProperty.call(view||{},k)).map(k=>[k,view[k]]));}
function rolePlan(id){const clean=roleId(id),r=getRole(clean);if(!r)return{ok:false,error:'Puesto IA no reconocido.'};const action=defaultActionForRole(clean);return{ok:true,roleId:clean,agent:workforceAgent(clean),title:r.title,family:r.family,department:r.department,level:r.level,reportsTo:r.reportsTo,mission:r.mission,responsibilities:[...r.responsibilities],kpis:[...r.kpis],requiredSources:requiredSourcesForRole(clean),defaultAction:action,executable:Boolean(action)};}
function familyPlan(family){const key=String(family||'').trim().toLowerCase(),ids=workforce().families()[key]||[];return{family:key,label:workforce().FAMILIES[key]?.label||null,roles:ids.map(rolePlan).filter(x=>x.ok)};}
function scheduledFamily(date=new Date()){const keys=Object.keys(workforce().FAMILIES);if(!keys.length)return null;const hours=Math.floor(date.getTime()/3600000);return keys[((hours%keys.length)+keys.length)%keys.length];}
function normalizeValidation(output,gate){const result={...(output?.result||{})};result.validation=gate.status;result.sourceGate=gate;if(gate.status==='NO_VALIDADO'){result.facts=[];result.inferences=[];result.estimates=[];result.recommendations=[];}return result;}
function configurationFacts(role,gate){return[truth.fact({title:role.title,department:role.department,mission:role.mission},'Enterprise Workforce Registry','VERIFICADO'),truth.fact({requiredSources:gate.required,missingSources:gate.missing},'Nutretium Truth Layer',gate.status)];}
function roleRecommendations(role,gate){if(!gate.ok)return[truth.recommendation(`Completar o refrescar las fuentes requeridas antes de que ${role.title} emita conclusiones operativas.`,gate.required,'BAJO')];return role.responsibilities.slice(0,4).map(x=>truth.recommendation(x,gate.required,'BAJO'));}

async function runRoleWithSnapshot({id,action,snapshot,env=process.env}={}){
  zeroCost.assertZeroSpend(env);
  const clean=roleId(id),role=getRole(clean);if(!role)throw new Error('Puesto IA no reconocido.');
  const selected=String(action||defaultActionForRole(clean)||'').trim().toLowerCase();if(!selected)throw new Error(`El puesto ${role.title} no tiene una acción autónoma segura configurada.`);
  const agent=workforceAgent(clean),policy=governance.policy(agent,selected);if(!policy.allowed)throw new Error(policy.error||'Acción no permitida.');
  if(policy.requiresApproval)return{policy,provider:{mode:'blocked',externalSpendLimitEur:0,model:null},result:{agent,workforceRoleId:clean,action:selected,status:'HUMAN_APPROVAL_REQUIRED',validation:'NO_VALIDADO',requiresHumanDecision:true,role:{title:role.title,department:role.department,family:role.family,level:role.level,reportsTo:role.reportsTo},reason:'La acción no es autónoma y debe pasar por aprobación humana.'}};
  const required=requiredSourcesForRole(clean),rawGate=truth.sourceGate(snapshot,required),gate={...rawGate,required},view=baseRuntime.businessView(snapshot);
  let base={provider:{mode:'deterministic',externalSpendLimitEur:0,model:null},result:{}};
  if(gate.ok)base=await baseRuntime.runWithSnapshot(agent,selected,snapshot,env);
  const result=normalizeValidation(base,gate);result.agent=agent;result.workforceRoleId=clean;result.action=selected;result.status=gate.ok?'COMPLETED':'NO_VALIDADO';result.generatedAt=new Date().toISOString();
  result.role={title:role.title,department:role.department,family:role.family,level:role.level,reportsTo:role.reportsTo,mission:role.mission,kpis:[...role.kpis]};result.businessContext=contextForRole(clean,view);
  result.facts=[...configurationFacts(role,gate),...(Array.isArray(result.facts)?result.facts:[])];result.recommendations=[...roleRecommendations(role,gate),...(Array.isArray(result.recommendations)?result.recommendations:[])];result.requiresHumanDecision=false;
  return{policy,provider:base.provider||{mode:'deterministic',externalSpendLimitEur:0,model:null},result};
}

async function persistRoleRun({id,action,requestedBy='system',snapshot=null,env=process.env}={}){
  zeroCost.assertZeroSpend(env);const clean=roleId(id),startedAt=new Date().toISOString(),runId=crypto.randomUUID();
  try{const snap=snapshot||await truth.snapshot(),output=await runRoleWithSnapshot({id:clean,action,snapshot:snap,env});const record={id:runId,agent:workforceAgent(clean),workforceRoleId:clean,action:output.result.action,status:output.result.status==='HUMAN_APPROVAL_REQUIRED'?'approval_required':'completed',requestedBy,startedAt,completedAt:new Date().toISOString(),output};await enterprise.save('ai-runs',record,SYSTEM,{id:runId,create:true,reason:'enterprise-workforce-run'});return record;}
  catch(error){await enterprise.save('ai-runs',{id:runId,agent:workforceAgent(clean),workforceRoleId:clean,action:String(action||''),status:'failed',requestedBy,startedAt,failedAt:new Date().toISOString(),error:String(error.message||error).slice(0,1000)},SYSTEM,{id:runId,create:true,reason:'enterprise-workforce-run-failed'}).catch(()=>{});throw Object.assign(error,{runId});}
}

async function runFamily({family,requestedBy='system',env=process.env,maxRoles=null,budgetGuard=null}={}){
  zeroCost.assertZeroSpend(env);const plan=familyPlan(family);if(!plan.label)throw new Error('Familia corporativa no reconocida.');
  const manual=zeroCost.manualLimits(env),limit=Math.max(1,Math.min(Number(maxRoles)||manual.maxRoles,manual.maxRoles)),snapshot=await truth.snapshot(),results=[];let budgetExhausted=false;
  for(const p of plan.roles.slice(0,limit)){
    if(budgetGuard&&!budgetGuard.canContinue()){budgetExhausted=true;break;}
    if(!p.executable){results.push({roleId:p.roleId,title:p.title,status:'skipped',reason:'no_safe_autonomous_action'});continue;}
    try{const record=await persistRoleRun({id:p.roleId,action:p.defaultAction,requestedBy,snapshot,env});results.push({roleId:p.roleId,title:p.title,action:p.defaultAction,status:record.status,id:record.id,validation:record.output?.result?.validation||'NO_VALIDADO'});}
    catch(error){results.push({roleId:p.roleId,title:p.title,action:p.defaultAction,status:'failed',error:String(error.message||error).slice(0,300)});}
  }
  return{generatedAt:new Date().toISOString(),family:plan.family,label:plan.label,dataQuality:snapshot.quality,roles:plan.roles.length,executed:results.length,failed:results.filter(x=>x.status==='failed').length,budgetExhausted,zeroCost:true,externalSpendLimitEur:0,results};
}

async function runScheduledCycle({requestedBy='workforce-worker',date=new Date()}={}){
  const family=scheduledFamily(date);if(!family)throw new Error('No hay familias corporativas configuradas.');
  const env={...process.env,AI_PROVIDER:'deterministic',AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PAID_PROVIDER_ENABLED:'false',AUTO_RECHARGE_ENABLED:'false'},limits=zeroCost.scheduledLimits(env),guard=zeroCost.budget(Date.now(),env);
  return runFamily({family,requestedBy,env,maxRoles:limits.maxRoles,budgetGuard:guard});
}

function status(){const validation=workforce().validate(),families=Object.keys(workforce().FAMILIES);return{ok:validation.ok,roles:validation.roles,families:validation.families,scheduledFamily:scheduledFamily(),rotationHours:families.length,zeroCost:zeroCost.status(),externalSpendLimitEur:0,validation};}
module.exports={SYSTEM,FAMILY_REQUIRED_SOURCES,FAMILY_CONTEXT,workforceAgent,requiredSourcesForRole,defaultActionForRole,contextForRole,rolePlan,familyPlan,scheduledFamily,runRoleWithSnapshot,persistRoleRun,runFamily,runScheduledCycle,status};
