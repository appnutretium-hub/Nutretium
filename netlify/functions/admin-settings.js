'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {exigePermiso}=require('../lib/staff');
const settings=require('../lib/settings');
const vault=require('../lib/config-vault');
const paymentConfig=require('../lib/payment-config');
const audit=require('../lib/audit-log');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,payload)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(payload)});
function meta(s){return{bannerEnabled:s.content.bannerEnabled,navigationManaged:s.navigation.managed,navigationItems:s.navigation.items.filter(x=>x.enabled).length,couponsManaged:s.couponsManaged,couponCount:s.coupons.length,pointsEnabled:s.points.enabled,shippingManaged:s.shipping.managed,shippingEnabled:s.shipping.enabled,shippingRateCents:s.shipping.rateCents,shippingFreeFromCents:s.shipping.freeFromCents,shippingCountry:s.shipping.country,paymentManaged:s.payment.managed,paymentEnabled:s.payment.enabled,paymentEnvironment:s.payment.environment,paymentLive:s.payment.commerceLive}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 const staff=await exigePermiso(event,'settings');if(!staff.ok)return json(staff.statusCode,{error:staff.error});
 if(event.httpMethod==='GET'){const [data,payment,vaultStatus]=await Promise.all([settings.readWithVersion(),paymentConfig.publicStatus(),vault.paymentStatus()]);return json(200,{settings:data.settings,version:data.version,operator:staff.email,role:staff.role,payment:{...payment,vault:vaultStatus}})}
 if(event.httpMethod==='POST'){
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
  if(body.action==='save-payment-secret'||body.action==='clear-payment-secret'){
   if(staff.role!=='owner')return json(403,{error:'Solo el propietario puede modificar las credenciales de la pasarela de pago.'});
   try{await audit.append({event,actor:staff.email,action:'PAYMENT_SECRET_INTENT',resource:'payment-vault',outcome:'INTENT',metadata:{operation:body.action}})}catch{return json(503,{error:'No se puede registrar la auditoría; las credenciales no se han modificado.'})}
   try{
    const status=body.action==='clear-payment-secret'?(await vault.clearPayment(),await vault.paymentStatus()):await vault.writePayment({merchantCode:body.merchantCode,secretKey:body.secretKey});
    await audit.append({event,actor:staff.email,action:'PAYMENT_SECRET_UPDATED',resource:'payment-vault',outcome:'SUCCESS',metadata:{operation:body.action,merchantCodeConfigured:status.merchantCodeConfigured,secretKeyConfigured:status.secretKeyConfigured}}).catch(()=>{});
    return json(200,{ok:true,paymentVault:status});
   }catch(e){console.error('[admin-settings payment secret]',e);return json(e?.code==='INVALID'?422:503,{error:e?.code==='INVALID'?'Indica el código de comercio y la clave secreta de Redsys.':'No se pudieron guardar las credenciales de pago de forma segura.'})}
  }
  if(body.action!=='save')return json(400,{error:'Acción no reconocida.'});
  const next=settings.normalize(body.settings||{});
  if(next.shipping.managed&&next.shipping.enabled&&next.shipping.rateCents===null)return json(422,{error:'Indica una tarifa de envío válida antes de activar los envíos.'});
  if(next.payment.managed&&next.payment.enabled&&next.payment.environment==='production'&&next.payment.commerceLive){const status=await vault.paymentStatus();if(!status.merchantCodeConfigured||!status.secretKeyConfigured)return json(422,{error:'Antes de activar pagos reales guarda las credenciales Redsys en la sección Pasarela de pago.'})}
  try{await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_INTENT',resource:'commerce-settings',outcome:'INTENT',metadata:meta(next)})}catch{return json(503,{error:'No se puede registrar la auditoría; los ajustes no se han modificado.'})}
  try{
   const saved=await settings.write(next,body.version||null);
   const payment=await paymentConfig.publicStatus();
   await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_UPDATED',resource:'commerce-settings',outcome:'SUCCESS',metadata:{version:saved.version,...meta(saved.settings)}}).catch(()=>{});
   return json(200,{ok:true,settings:saved.settings,version:saved.version,operator:staff.email,payment});
  }catch(e){
   if(e?.code==='CONFLICT'){await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_CONFLICT',resource:'commerce-settings',outcome:'CONFLICT',metadata:{requestedVersion:body.version||null}}).catch(()=>{});return json(409,{error:'Los ajustes han cambiado desde otra sesión. Recarga antes de volver a guardar.',currentVersion:e.currentVersion||null})}
   console.error('[admin-settings]',e);return json(503,{error:'No se pudieron guardar los ajustes.'});
  }
 }
 return json(405,{error:'Method Not Allowed'});
};
