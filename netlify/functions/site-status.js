'use strict';
const {cabecerasCORS}=require('../lib/cors');
const shipping=require('../lib/shipping');
const paymentConfig=require('../lib/payment-config');
const {assessCommerceDependencies}=require('../lib/commerce-readiness');
const CORS=cabecerasCORS('GET, OPTIONS');
const yes=n=>String(process.env[n]||'').toLowerCase()==='true';
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const maintenance=yes('MAINTENANCE_MODE');
 const [shippingReady,payment]=await Promise.all([
  shipping.configured().catch(()=>false),
  paymentConfig.publicStatus().catch(()=>({managed:false,enabled:false,environment:'test',commerceLive:false,credentialsConfigured:false,dedicatedVaultKey:false,ready:false})),
 ]);
 const storefrontReady=!maintenance;
 const paymentsReady=Boolean(payment.enabled&&payment.environment==='production'&&payment.commerceLive&&payment.credentialsConfigured&&(!payment.managed||payment.dedicatedVaultKey));
 const dependencies=await assessCommerceDependencies({probeFactusol:storefrontReady&&shippingReady&&paymentsReady}).catch(()=>({ready:false,catalog:{ready:false},compliance:{ready:false,reason:'check-failed'},factusol:{ready:false,reason:'check-failed'}}));
 const commerceReady=Boolean(storefrontReady&&shippingReady&&paymentsReady&&dependencies.ready);
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({
  maintenance,storefrontReady,commerceReady,paymentsReady,shippingReady,
  factusolReady:dependencies.factusol?.ready===true,
  catalogReady:dependencies.catalog?.ready===true,
  complianceReady:dependencies.compliance?.ready===true,
  payment:{managed:payment.managed,environment:payment.environment,enabled:payment.enabled,commerceLive:payment.commerceLive,credentialsConfigured:payment.credentialsConfigured,dedicatedVaultKey:payment.dedicatedVaultKey},
  catalog:{active:dependencies.catalog?.active||0,missingImage:dependencies.catalog?.missingImage||0,presentationReady:dependencies.catalog?.presentationReady===true},
  compliance:{strict:dependencies.compliance?.strict===true,blocked:dependencies.compliance?.blocked||0,reason:dependencies.compliance?.reason||null},
  factusol:{configured:dependencies.factusol?.configured===true,connected:dependencies.factusol?.connected===true,exercise:dependencies.factusol?.exercise||null,reason:dependencies.factusol?.reason||null},
 })};
};
