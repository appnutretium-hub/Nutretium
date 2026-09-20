'use strict';

const workforce=require('./enterprise-workforce');
const A=(label,department,scopes,autonomous,sensitive=[])=>({label,department,scopes,autonomous,sensitive});
const AGENTS=Object.freeze({
 executive_brain:A('Cerebro Ejecutivo IA','Dirección',['platform.read','analytics.read','operations.propose'],['executive-brief','cross-functional-scan','growth-priorities'],['policy-change','automation-enable','integration-enable']),
 strategy:A('Estrategia & Expansión IA','Dirección',['analytics.read','platform.read','operations.propose'],['strategy-scan','expansion-draft','scenario-draft'],['capital-allocation','market-entry-approve']),
 audit:A('Auditor Interno IA','Control',['audit.read','platform.read','security.propose'],['evidence-audit','decision-challenge','data-quality-audit'],['audit-policy-change']),
 data_quality:A('Data Quality IA','Datos',['platform.read','analytics.read','operations.propose'],['quality-scan','source-freshness-scan','contradiction-scan'],['source-trust-change']),
 sales:A('Ventas IA','Comercial',['analytics.read','catalog.read','sales.propose'],['sales-brief','trend-scan','opportunity-scan','hourly-demand-scan'],['price-change','discount','promotion-publish']),
 forecasting:A('Forecast & Demand Planning IA','Comercial',['analytics.read','inventory.read','purchasing.propose'],['demand-forecast','coverage-scan','seasonality-scan'],['forecast-policy-change']),
 inventory:A('Stock IA','Supply Chain',['inventory.read','inventory.propose'],['low-stock-scan','rotation-scan','expiry-scan','dead-stock-scan'],['stock-adjust','lot-recall','lot-release']),
 purchasing:A('Compras Asertivas IA','Supply Chain',['purchasing.read','inventory.read','analytics.read','purchasing.propose'],['replenishment-draft','purchase-plan','supplier-gap-scan'],['supplier-create','purchase-order-approve','purchase-order-send']),
 suppliers:A('Supplier Intelligence IA','Supply Chain',['purchasing.read','compliance.read','analytics.read','purchasing.propose'],['supplier-scorecard','supplier-risk-scan','sourcing-draft'],['supplier-create','supplier-block','contract-commit']),
 logistics:A('Logística IA','Supply Chain',['orders.read','shipping.read','shipping.propose'],['delay-scan','shipment-priority','carrier-performance-scan'],['shipment-change','carrier-change','return-approve']),
 operations:A('Operaciones IA','Operaciones',['platform.read','operations.propose'],['health-scan','incident-triage','capacity-scan','process-bottleneck-scan'],['maintenance-mode','integration-enable','automation-enable']),
 product_innovation:A('Innovación de Producto IA','Producto',['catalog.read','analytics.read','compliance.read','catalog.propose'],['product-opportunity-scan','concept-draft','portfolio-gap-scan'],['product-publish','product-approve']),
 category_management:A('Category Management IA','Producto',['catalog.read','analytics.read','inventory.read','catalog.propose'],['assortment-scan','category-performance','range-draft'],['product-unpublish','price-change']),
 pricing:A('Pricing & Margen IA','Finanzas',['finance.read','analytics.read','catalog.read','finance.propose'],['margin-scan','price-opportunity-scan','promo-economics'],['price-change','discount']),
 finance:A('Finanzas & CFO IA','Finanzas',['finance.read','analytics.read','finance.propose'],['financial-brief','reconciliation-scan','anomaly-scan','cash-risk-scan'],['refund','invoice-void','payment-config-change','capital-allocation']),
 procurement_control:A('Control de Compras IA','Finanzas',['finance.read','purchasing.read','finance.propose'],['purchase-budget-check','po-anomaly-scan'],['purchase-order-approve']),
 marketing:A('Marketing IA','Growth',['marketing.read','analytics.read','marketing.propose'],['campaign-draft','content-draft','slow-hours-scan','channel-performance-scan'],['publish','discount','customer-message']),
 growth:A('Growth IA','Growth',['analytics.read','marketing.read','catalog.read','marketing.propose'],['funnel-scan','growth-experiment-draft','conversion-opportunity-scan'],['experiment-publish','discount']),
 crm:A('CRM & Retención IA','Clientes',['customer.read','analytics.read','marketing.propose'],['retention-scan','segment-draft','loyalty-opportunity-scan'],['customer-message','loyalty-rule-change']),
 ecommerce:A('Ecommerce IA','Digital',['catalog.read','analytics.read','catalog.propose'],['catalog-audit','seo-draft','merchandising-draft','conversion-scan'],['product-publish','product-unpublish','price-change']),
 seo:A('SEO & Contenido IA','Digital',['catalog.read','analytics.read','marketing.propose'],['seo-audit','content-gap-scan','search-intent-draft'],['publish']),
 marketplace:A('Marketplace IA','Digital',['catalog.read','analytics.read','operations.propose'],['marketplace-gap-scan','listing-draft','channel-margin-scan'],['marketplace-publish','integration-enable']),
 customer_service:A('Atención al Cliente IA','Clientes',['customer.read','orders.read','customer.propose'],['case-triage','reply-draft','sentiment-scan'],['customer-message','refund','account-change']),
 customer_experience:A('Customer Experience IA','Clientes',['customer.read','analytics.read','customer.propose'],['journey-friction-scan','review-insight-scan','cx-priority-draft'],['policy-change']),
 compliance:A('Food Safety & Compliance IA','Control',['compliance.read','catalog.read','compliance.propose'],['documentation-gap-scan','claim-scan','traceability-scan','label-risk-scan'],['product-approve','product-block','lot-release','claim-approve']),
 legal:A('Legal & Contracts IA','Control',['compliance.read','purchasing.read','platform.read','compliance.propose'],['contract-risk-scan','legal-gap-scan','terms-review-draft'],['contract-commit','legal-approval']),
 enterprise_risk:A('Enterprise Risk IA','Control',['platform.read','audit.read','finance.read','security.propose'],['risk-register-scan','concentration-risk-scan','continuity-scan'],['risk-acceptance']),
 security:A('Ciberseguridad IA','Tecnología',['security.read','audit.read','security.propose'],['security-scan','audit-scan','dependency-risk-scan','access-risk-scan'],['session-revoke','integration-disable','policy-change','secret-rotate']),
 development:A('Desarrollo IA','Tecnología',['platform.read','development.propose'],['diagnostic','test-plan','patch-draft','architecture-scan'],['code-merge','production-deploy','workflow-change']),
 sre:A('SRE & Fiabilidad IA','Tecnología',['platform.read','audit.read','operations.propose'],['reliability-scan','error-budget-scan','incident-pattern-scan'],['production-deploy','maintenance-mode']),
 data_analytics:A('Business Intelligence IA','Datos',['analytics.read','platform.read','operations.propose'],['kpi-brief','correlation-scan','data-gap-scan'],['metric-definition-change']),
 hr:A('People & RRHH IA','People',['platform.read','operations.propose'],['workload-scan','training-gap-scan','staffing-draft'],['staff-change','permission-change','employment-decision']),
 training:A('Formación & SOP IA','People',['platform.read','compliance.read','operations.propose'],['sop-gap-scan','training-draft','knowledge-gap-scan'],['sop-publish']),
 sustainability:A('Sostenibilidad IA','ESG',['analytics.read','purchasing.read','operations.propose'],['waste-scan','resource-efficiency-scan','supplier-esg-draft'],['esg-claim-publish']),
 franchise:A('Franquicia & Expansión IA','Expansión',['platform.read','analytics.read','operations.propose'],['franchise-readiness-scan','site-score-draft','standardization-scan'],['franchise-approve','market-entry-approve']),
});

const NEVER_AUTONOMOUS=new Set([
 'refund','payment-config-change','secret-rotate','policy-change','code-merge','production-deploy','workflow-change',
 'purchase-order-approve','purchase-order-send','product-approve','product-block','claim-approve','lot-release','lot-recall',
 'staff-change','permission-change','employment-decision','integration-enable','integration-disable','automation-enable','account-change',
 'capital-allocation','market-entry-approve','contract-commit','legal-approval','risk-acceptance','supplier-create','supplier-block',
 'marketplace-publish','promotion-publish','publish','product-publish','product-unpublish','price-change','discount','customer-message',
 ...workforce.FORBIDDEN_AUTONOMY
]);
const VETO_AGENTS=new Set(['audit','compliance','enterprise_risk','security','finance','procurement_control']);
const safe=v=>String(v||'').trim().toLowerCase();
const WORKFORCE_PREFIX='workforce__';
function workforceAgentId(roleId){
 const id=safe(roleId);
 return workforce.getRole(id)?`${WORKFORCE_PREFIX}${id}`:id;
}
function resolveWorkforceId(agent){const id=safe(agent);if(id.startsWith(WORKFORCE_PREFIX))return id.slice(WORKFORCE_PREFIX.length);return AGENTS[id]?null:id;}

function profile(agent){
 const name=safe(agent),legacy=AGENTS[name];
 if(legacy)return{agent:name,label:legacy.label,title:legacy.label,department:legacy.department,family:null,level:null,reportsTo:null,mission:null,responsibilities:[],kpis:[],scopes:[...legacy.scopes],autonomous:[...legacy.autonomous],sensitive:[...legacy.sensitive],vetoAgent:VETO_AGENTS.has(name),source:'legacy'};
 const roleId=resolveWorkforceId(name),r=roleId&&workforce.getRole(roleId);
 if(!r)return null;
 return{agent:name,roleId,label:r.title,title:r.title,department:r.department,family:r.family,level:r.level,reportsTo:r.reportsTo?workforceAgentId(r.reportsTo):null,mission:r.mission,responsibilities:[...r.responsibilities],kpis:[...r.kpis],scopes:[...r.scopes],autonomous:[...r.autonomous],sensitive:[...r.sensitive],vetoAgent:workforce.VETO_ROLES.has(roleId),source:'enterprise-workforce'};
}
function policy(agent,action){
 const name=safe(agent),a=safe(action),def=AGENTS[name];
 if(!a)return{allowed:false,error:'Acción de agente no indicada.'};
 if(def){
  const sensitive=def.sensitive.includes(a)||NEVER_AUTONOMOUS.has(a);
  const autonomous=def.autonomous.includes(a)&&!sensitive;
  return{allowed:true,agent:name,action:a,label:def.label,department:def.department,scopes:def.scopes,sensitive,autonomous,requiresApproval:!autonomous,vetoAgent:VETO_AGENTS.has(name),source:'legacy'};
 }
 const roleId=resolveWorkforceId(name),wp=roleId&&workforce.rolePolicy(roleId,a);
 if(!wp||!wp.allowed)return{allowed:false,error:wp?.error||'Agente no reconocido.'};
 const r=workforce.getRole(roleId);
 return{allowed:true,agent:name,roleId,action:a,label:r.title,department:r.department,scopes:[...r.scopes],sensitive:wp.requiresApproval,autonomous:wp.autonomous,requiresApproval:wp.requiresApproval,vetoAgent:wp.vetoRole,riskTier:wp.risk,source:'enterprise-workforce'};
}
function canApprove(proposal,auth){
 if(!proposal||!auth)return false;
 if(String(proposal.proposedBy||'').toLowerCase()===String(auth.email||'').toLowerCase())return false;
 return['owner','admin'].includes(String(auth.role||''));
}
function publicRegistry(){
 const legacy=Object.fromEntries(Object.entries(AGENTS).map(([key,value])=>[key,{label:value.label,title:value.label,department:value.department,scopes:value.scopes,autonomous:value.autonomous,sensitive:value.sensitive,vetoAgent:VETO_AGENTS.has(key),source:'legacy'}]));
 const enterprise=Object.fromEntries(Object.entries(workforce.publicRegistry()).map(([roleId,value])=>{
  const key=workforceAgentId(roleId);
  return[key,{...value,label:value.title,roleId,agentId:key,reportsTo:value.reportsTo?workforceAgentId(value.reportsTo):null,scopes:workforce.ROLES[roleId].scopes,source:'enterprise-workforce'}];
 }));
 return{...legacy,...enterprise};
}
function departments(){const out={};for(const [key,value] of Object.entries(publicRegistry())){(out[value.department]??=[]).push(key)}return out}
function workforceSummary(){
 const validation=workforce.validate(),registry=publicRegistry();
 return{...validation,legacyAgents:Object.keys(AGENTS).length,totalRegistered:Object.keys(registry).length,collisionSafe:true,families:Object.fromEntries(Object.entries(workforce.families()).map(([k,v])=>[k,v.length]))};
}
module.exports={AGENTS,NEVER_AUTONOMOUS,VETO_AGENTS,WORKFORCE_PREFIX,workforceAgentId,resolveWorkforceId,policy,profile,canApprove,publicRegistry,departments,workforce,workforceSummary};
