'use strict';

const AGENTS=Object.freeze({
 director:{
  label:'Dirección IA',
  scopes:['platform.read','analytics.read','operations.propose'],
  autonomous:['summarize','prioritize','risk-scan','daily-brief'],
  sensitive:['automation-enable','policy-change','integration-enable'],
 },
 sales:{
  label:'Ventas IA',
  scopes:['analytics.read','catalog.read','sales.propose'],
  autonomous:['summarize','trend-scan','opportunity-scan'],
  sensitive:['price-change','discount','promotion-publish'],
 },
 inventory:{
  label:'Stock IA',
  scopes:['inventory.read','inventory.propose'],
  autonomous:['low-stock-scan','rotation-scan','expiry-scan'],
  sensitive:['stock-adjust','lot-recall','lot-release'],
 },
 purchasing:{
  label:'Compras IA',
  scopes:['purchasing.read','inventory.read','purchasing.propose'],
  autonomous:['replenishment-draft','supplier-gap-scan'],
  sensitive:['supplier-create','purchase-order-approve','purchase-order-send'],
 },
 marketing:{
  label:'Marketing IA',
  scopes:['marketing.read','analytics.read','marketing.propose'],
  autonomous:['campaign-draft','content-draft','slow-hours-scan'],
  sensitive:['publish','discount','customer-message'],
 },
 ecommerce:{
  label:'Ecommerce IA',
  scopes:['catalog.read','analytics.read','catalog.propose'],
  autonomous:['catalog-audit','seo-draft','merchandising-draft'],
  sensitive:['product-publish','product-unpublish','price-change'],
 },
 customer_service:{
  label:'Atención al cliente IA',
  scopes:['customer.read','orders.read','customer.propose'],
  autonomous:['case-triage','reply-draft'],
  sensitive:['customer-message','refund','account-change'],
 },
 logistics:{
  label:'Logística IA',
  scopes:['orders.read','shipping.read','shipping.propose'],
  autonomous:['delay-scan','shipment-priority'],
  sensitive:['shipment-change','carrier-change','return-approve'],
 },
 finance:{
  label:'Finanzas IA',
  scopes:['finance.read','analytics.read','finance.propose'],
  autonomous:['margin-scan','reconciliation-scan','anomaly-scan'],
  sensitive:['refund','price-change','invoice-void','payment-config-change'],
 },
 compliance:{
  label:'Food Safety & Compliance IA',
  scopes:['compliance.read','catalog.read','compliance.propose'],
  autonomous:['documentation-gap-scan','claim-scan','traceability-scan'],
  sensitive:['product-approve','product-block','lot-release','claim-approve'],
 },
 security:{
  label:'Ciberseguridad IA',
  scopes:['security.read','audit.read','security.propose'],
  autonomous:['security-scan','audit-scan','dependency-risk-scan'],
  sensitive:['session-revoke','integration-disable','policy-change','secret-rotate'],
 },
 development:{
  label:'Desarrollo IA',
  scopes:['platform.read','development.propose'],
  autonomous:['diagnostic','test-plan','patch-draft'],
  sensitive:['code-merge','production-deploy','workflow-change'],
 },
 operations:{
  label:'Operaciones IA',
  scopes:['platform.read','operations.propose'],
  autonomous:['health-scan','incident-triage'],
  sensitive:['maintenance-mode','integration-enable','automation-enable'],
 },
});

const NEVER_AUTONOMOUS=new Set([
 'refund','payment-config-change','secret-rotate','policy-change','code-merge','production-deploy',
 'purchase-order-approve','purchase-order-send','product-approve','claim-approve','lot-release',
 'staff-change','permission-change','integration-enable','automation-enable','account-change',
]);
const safe=v=>String(v||'').trim().toLowerCase();

function policy(agent,action){
 const name=safe(agent),a=safe(action),def=AGENTS[name];
 if(!def)return{allowed:false,error:'Agente no reconocido.'};
 if(!a)return{allowed:false,error:'Acción de agente no indicada.'};
 const sensitive=def.sensitive.includes(a)||NEVER_AUTONOMOUS.has(a);
 const autonomous=def.autonomous.includes(a)&&!sensitive;
 return{allowed:true,agent:name,action:a,label:def.label,scopes:def.scopes,sensitive,autonomous,requiresApproval:!autonomous};
}
function canApprove(proposal,auth){
 if(!proposal||!auth)return false;
 if(String(proposal.proposedBy||'').toLowerCase()===String(auth.email||'').toLowerCase())return false;
 return['owner','admin'].includes(String(auth.role||''));
}
function publicRegistry(){
 return Object.fromEntries(Object.entries(AGENTS).map(([key,value])=>[key,{label:value.label,scopes:value.scopes,autonomous:value.autonomous,sensitive:value.sensitive}]));
}
module.exports={AGENTS,NEVER_AUTONOMOUS,policy,canApprove,publicRegistry};
