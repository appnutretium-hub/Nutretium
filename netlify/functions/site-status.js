'use strict';
const {cabecerasCORS}=require('../lib/cors');
const shipping=require('../lib/shipping');
const paymentConfig=require('../lib/payment-config');
const external=require('../lib/external-readiness');
const CORS=cabecerasCORS('GET, OPTIONS');
const yes=n=>String(process.env[n]||'').toLowerCase()==='true';
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const maintenance=yes('MAINTENANCE_MODE');
 const [shippingPolicy,shippingReady,payment,integrations]=await Promise.all([
  shipping.policy().catch(()=>({managed:false,enabled:false,methods:[]})),
  shipping.configured().catch(()=>false),
  paymentConfig.publicStatus().catch(()=>({managed:false,enabled:false,environment:'test',commerceLive:false,credentialsConfigured:false,dedicatedVaultKey:false,ready:false})),
  external.managedIntegrationStates().catch(()=>({email:{ready:false,reason:'status-unavailable'},tpv:{ready:false,reason:'status-unavailable'}}))
 ]);
 const storefrontReady=!maintenance;
 const commerceReady=Boolean(storefrontReady&&shippingReady&&payment.enabled&&payment.environment==='production'&&payment.commerceLive&&payment.credentialsConfigured&&(!payment.managed||payment.dedicatedVaultKey));
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({maintenance,storefrontReady,commerceReady,paymentsReady:commerceReady,shippingReady,shipping:{managed:Boolean(shippingPolicy.managed),enabled:Boolean(shippingPolicy.enabled),methodCount:Array.isArray(shippingPolicy.methods)?shippingPolicy.methods.filter(m=>m?.enabled).length:0},payment:{managed:payment.managed,environment:payment.environment,enabled:payment.enabled,commerceLive:payment.commerceLive,credentialsConfigured:payment.credentialsConfigured,dedicatedVaultKey:payment.dedicatedVaultKey},integrations:{email:{ready:Boolean(integrations.email?.ready),reason:integrations.email?.reason||'unknown',domain:integrations.email?.domain||null,status:integrations.email?.status||null},tpvsol:{ready:Boolean(integrations.tpv?.ready),reason:integrations.tpv?.reason||'unknown',mode:integrations.tpv?.mode||null,validated:Boolean(integrations.tpv?.validated),endpointConfigured:Boolean(integrations.tpv?.endpointConfigured),tokenConfigured:Boolean(integrations.tpv?.tokenConfigured),dedicatedVaultKey:Boolean(integrations.tpv?.dedicatedVaultKey)}}})};
};
