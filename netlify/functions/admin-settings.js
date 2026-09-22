'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {exigePermiso}=require('../lib/staff');
const settings=require('../lib/settings');
const vault=require('../lib/config-vault');
const paymentConfig=require('../lib/payment-config');
const integrationConfig=require('../lib/integration-config');
const audit=require('../lib/audit-log');
const {verifyStepUp}=require('../lib/security-step-up');
const defense=require('../lib/security-defense');
const security=require('../lib/security-policy');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,payload)=>({statusCode,headers:{...CORS,...security.securityHeaders()},body:JSON.stringify(payload)});
function meta(s){return{bannerEnabled:s.content.bannerEnabled,navigationManaged:s.navigation.managed,navigationItems:s.navigation.items.filter(x=>x.enabled).length,couponsManaged:s.couponsManaged,couponCount:s.coupons.length,pointsEnabled:s.points.enabled,shippingManaged:s.shipping.managed,shippingEnabled:s.shipping.enabled,shippingRateCents:s.shipping.rateCents,shippingFreeFromCents:s.shipping.freeFromCents,shippingCountry:s.shipping.country,shippingMethods:(s.shipping.methods||[]).filter(x=>x.enabled).length,paymentManaged:s.payment.managed,paymentEnabled:s.payment.enabled,paymentEnvironment:s.payment.environment,paymentLive:s.payment.commerceLive,emailManaged:s.integrations?.email?.managed,emailEnabled:s.integrations?.email?.enabled,tpvsolManaged:s.integrations?.tpvsol?.managed,tpvsolEnabled:s.integrations?.tpvsol?.enabled,tpvsolValidated:s.integrations?.tpvsol?.validated}}
function paymentPrivilegeIncrease(current,next){const a=current?.payment||{},b=next?.payment||{};return Boolean((b.environment==='production'&&a.environment!=='production')||(b.commerceLive===true&&a.commerceLive!==true)||(b.enabled===true&&a.enabled!==true&&b.environment==='production')||(b.managed===true&&a.managed!==true&&b.environment==='production'))}
function integrationPrivilegeIncrease(current,next){const a=current?.integrations||{},b=next?.integrations||{};return Boolean((b.email?.managed&&b.email?.enabled&&!(a.email?.managed&&a.email?.enabled))||(b.tpvsol?.validated===true&&a.tpvsol?.validated!==true)||(b.tpvsol?.enabled===true&&b.tpvsol?.managed===true&&a.tpvsol?.enabled!==true))}
async function requireStep(event,staff){const gate=await verifyStepUp(event,staff);return gate.ok?null:json(gate.statusCode,{error:gate.error,code:gate.code})}
async function requireNonce(event,staff,scope){const gate=await defense.consumeMutationNonce({event,actor:staff.email,scope});return gate.ok?null:json(gate.statusCode,{error:gate.error,code:gate.code})}
async function requireAudit(){const gate=await defense.verifyAuditIntegrity();return gate.ok?null:json(gate.statusCode,{error:gate.error,code:gate.code})}
function hasValidShipping(s){if(!s?.managed||!s.enabled)return true;if(Number.isInteger(s.rateCents)&&s.rateCents>=0)return true;return Array.isArray(s.methods)&&s.methods.some(m=>m?.enabled&&Number.isInteger(m.rateCents)&&m.rateCents>=0)}
async function integrationStatuses(){const [resolved,resendVault,tpvVault]=await Promise.all([integrationConfig.publicStatus(),vault.secretStatus('resend').catch(()=>({vaultConfigured:false,dedicatedKeyConfigured:false,apiKeyConfigured:false,credentialsConfigured:false})),vault.secretStatus('tpvsol').catch(()=>({vaultConfigured:false,dedicatedKeyConfigured:false,tokenConfigured:false,credentialsConfigured:false}))]);return{email:{...resolved.email,vault:resendVault},tpvsol:{...resolved.tpvsol,vault:tpvVault}}}
async function mutateIntegrationSecret(event,staff,body){
 const service=String(body.service||'').toLowerCase();if(!['resend','tpvsol'].includes(service))return json(400,{error:'Integración no reconocida.'});
 if(staff.role!=='owner')return json(403,{error:'Solo el propietario puede modificar credenciales de integraciones.'});
 const action=body.action==='clear-integration-secret'?'clear':'save',step=await requireStep(event,staff);if(step)return step;const integrity=await requireAudit();if(integrity)return integrity;const nonce=await requireNonce(event,staff,`integration-secret:${service}:${action}`);if(nonce)return nonce;
 try{await audit.append({event,actor:staff.email,action:'INTEGRATION_SECRET_INTENT',resource:`integration-vault:${service}`,outcome:'INTENT',metadata:{operation:action,service}})}catch{return json(503,{error:'No se puede registrar la auditoría; las credenciales no se han modificado.'})}
 try{
  let status;if(action==='clear'){await vault.clearSecret(service);status=await vault.secretStatus(service)}else{const secret=String(body.secret||'').trim();if(!secret)return json(422,{error:'Indica la credencial antes de guardarla.'});status=await vault.writeSecret(service,service==='resend'?{apiKey:secret}:{token:secret})}
  await audit.append({event,actor:staff.email,action:'INTEGRATION_SECRET_UPDATED',resource:`integration-vault:${service}`,outcome:'SUCCESS',metadata:{operation:action,service,credentialsConfigured:status.credentialsConfigured,dedicatedKeyConfigured:status.dedicatedKeyConfigured}}).catch(()=>{});
  return json(200,{ok:true,service,vault:status,integrations:await integrationStatuses()});
 }catch(e){console.error('[admin-settings integration secret]',service,e);return json(e?.code==='INVALID'?422:503,{error:e?.code==='INVALID'?'La credencial indicada no es válida.':'No se pudo guardar la credencial de forma segura.'})}
}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 const staff=await exigePermiso(event,'settings');if(!staff.ok)return json(staff.statusCode,{error:staff.error});
 if(event.httpMethod==='GET'){const [data,payment,vaultStatus,integrations]=await Promise.all([settings.readWithVersion(),paymentConfig.publicStatus(),vault.paymentStatus(),integrationStatuses()]);return json(200,{settings:data.settings,version:data.version,operator:staff.email,role:staff.role,payment:{...payment,vault:vaultStatus},integrations})}
 if(event.httpMethod==='POST'){
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
  if(body.action==='save-integration-secret'||body.action==='clear-integration-secret')return mutateIntegrationSecret(event,staff,body);
  if(body.action==='save-payment-secret'||body.action==='clear-payment-secret'){
   if(staff.role!=='owner')return json(403,{error:'Solo el propietario puede modificar las credenciales de la pasarela de pago.'});
   const step=await requireStep(event,staff);if(step)return step;
   const integrity=await requireAudit();if(integrity)return integrity;
   const nonce=await requireNonce(event,staff,`payment-secret:${body.action}`);if(nonce)return nonce;
   try{await audit.append({event,actor:staff.email,action:'PAYMENT_SECRET_INTENT',resource:'payment-vault',outcome:'INTENT',metadata:{operation:body.action}})}catch{return json(503,{error:'No se puede registrar la auditoría; las credenciales no se han modificado.'})}
   try{
    const status=body.action==='clear-payment-secret'?(await vault.clearPayment(),await vault.paymentStatus()):await vault.writePayment({merchantCode:body.merchantCode,secretKey:body.secretKey});
    await audit.append({event,actor:staff.email,action:'PAYMENT_SECRET_UPDATED',resource:'payment-vault',outcome:'SUCCESS',metadata:{operation:body.action,merchantCodeConfigured:status.merchantCodeConfigured,secretKeyConfigured:status.secretKeyConfigured,dedicatedKeyConfigured:status.dedicatedKeyConfigured}}).catch(()=>{});
    return json(200,{ok:true,paymentVault:status});
   }catch(e){console.error('[admin-settings payment secret]',e);return json(e?.code==='INVALID'?422:503,{error:e?.code==='INVALID'?'Indica el código de comercio y la clave secreta de Redsys.':'No se pudieron guardar las credenciales de pago de forma segura.'})}
  }
  if(body.action!=='save')return json(400,{error:'Acción no reconocida.'});
  const current=await settings.read().catch(()=>settings.defaults),next=settings.normalize(body.settings||{}),privilegeIncrease=paymentPrivilegeIncrease(current,next)||integrationPrivilegeIncrease(current,next);
  if(staff.role!=='owner'&&privilegeIncrease)return json(403,{error:'Solo el propietario puede activar pagos o integraciones sensibles.'});
  if(privilegeIncrease){const step=await requireStep(event,staff);if(step)return step;const integrity=await requireAudit();if(integrity)return integrity;const nonce=await requireNonce(event,staff,'settings-privilege-increase');if(nonce)return nonce}
  if(!hasValidShipping(next.shipping))return json(422,{error:'Configura una tarifa general o al menos una zona/tarifa activa antes de activar los envíos.'});
  if(next.payment.managed&&next.payment.enabled&&next.payment.environment==='production'&&next.payment.commerceLive){const status=await vault.paymentStatus();if(!status.dedicatedKeyConfigured)return json(422,{error:'Antes de activar pagos reales configura CONFIG_VAULT_KEY como clave independiente de la bóveda.'});if(!status.merchantCodeConfigured||!status.secretKeyConfigured)return json(422,{error:'Antes de activar pagos reales guarda las credenciales Redsys en la sección Pasarela de pago.'})}
  if(next.integrations.email.managed&&next.integrations.email.enabled){const status=await vault.secretStatus('resend');if(!next.integrations.email.from||!next.integrations.email.orderNotificationEmail)return json(422,{error:'Completa remitente y email de pedidos antes de activar Resend.'});if(!status.dedicatedKeyConfigured||!status.apiKeyConfigured)return json(422,{error:'Antes de activar Resend guarda su API key en la bóveda cifrada con CONFIG_VAULT_KEY.'})}
  if(next.integrations.tpvsol.managed&&next.integrations.tpvsol.enabled){if(!['api','middleware'].includes(next.integrations.tpvsol.mode)||!/^https:\/\//i.test(next.integrations.tpvsol.endpoint))return json(422,{error:'TPVsol requiere modo API o middleware y un endpoint HTTPS válido.'});if(next.integrations.tpvsol.validated){const status=await vault.secretStatus('tpvsol');if(!status.dedicatedKeyConfigured||!status.tokenConfigured)return json(422,{error:'Antes de marcar TPVsol como validado guarda el token en la bóveda cifrada con CONFIG_VAULT_KEY.'})}}
  try{await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_INTENT',resource:'commerce-settings',outcome:'INTENT',metadata:meta(next)})}catch{return json(503,{error:'No se puede registrar la auditoría; los ajustes no se han modificado.'})}
  try{
   const saved=await settings.write(next,body.version||null),[payment,integrations]=await Promise.all([paymentConfig.publicStatus(),integrationStatuses()]);
   await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_UPDATED',resource:'commerce-settings',outcome:'SUCCESS',metadata:{version:saved.version,...meta(saved.settings)}}).catch(()=>{});
   return json(200,{ok:true,settings:saved.settings,version:saved.version,operator:staff.email,payment,integrations});
  }catch(e){
   if(e?.code==='CONFLICT'){await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_CONFLICT',resource:'commerce-settings',outcome:'CONFLICT',metadata:{requestedVersion:body.version||null}}).catch(()=>{});return json(409,{error:'Los ajustes han cambiado desde otra sesión. Recarga antes de volver a guardar.',currentVersion:e.currentVersion||null})}
   console.error('[admin-settings]',e);return json(503,{error:'No se pudieron guardar los ajustes.'});
  }
 }
 return json(405,{error:'Method Not Allowed'});
};
exports._test={paymentPrivilegeIncrease,integrationPrivilegeIncrease,hasValidShipping};
