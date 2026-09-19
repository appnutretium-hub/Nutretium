'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {exigePermiso}=require('../lib/staff');
const settings=require('../lib/settings');
const audit=require('../lib/audit-log');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,payload)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(payload)});
function meta(s){return{bannerEnabled:s.content.bannerEnabled,couponsManaged:s.couponsManaged,couponCount:s.coupons.length,pointsEnabled:s.points.enabled,pointsManaged:s.points.managed,shippingManaged:s.shipping.managed,shippingEnabled:s.shipping.enabled,shippingRateCents:s.shipping.rateCents,shippingFreeFromCents:s.shipping.freeFromCents,shippingCountry:s.shipping.country}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 const staff=await exigePermiso(event,'settings');if(!staff.ok)return json(staff.statusCode,{error:staff.error});
 if(event.httpMethod==='GET'){const data=await settings.readWithVersion();return json(200,{settings:data.settings,version:data.version,operator:staff.email})}
 if(event.httpMethod==='POST'){
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
  if(body.action!=='save')return json(400,{error:'Acción no reconocida.'});
  const next=settings.normalize(body.settings||{});
  if(next.shipping.managed&&next.shipping.enabled&&next.shipping.rateCents===null)return json(422,{error:'Indica una tarifa de envío válida antes de activar los envíos.'});
  try{await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_INTENT',resource:'commerce-settings',outcome:'INTENT',metadata:meta(next)})}catch{return json(503,{error:'No se puede registrar la auditoría; los ajustes no se han modificado.'})}
  try{
   const saved=await settings.write(next,body.version||null);
   await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_UPDATED',resource:'commerce-settings',outcome:'SUCCESS',metadata:{version:saved.version,...meta(saved.settings)}}).catch(()=>{});
   return json(200,{ok:true,settings:saved.settings,version:saved.version,operator:staff.email});
  }catch(e){
   if(e?.code==='CONFLICT'){await audit.append({event,actor:staff.email,action:'COMMERCE_SETTINGS_CONFLICT',resource:'commerce-settings',outcome:'CONFLICT',metadata:{requestedVersion:body.version||null}}).catch(()=>{});return json(409,{error:'Los ajustes han cambiado desde otra sesión. Recarga antes de guardar.',currentVersion:e.currentVersion||null})}
   console.error('[admin-settings]',e);return json(503,{error:'No se pudieron guardar los ajustes.'});
  }
 }
 return json(405,{error:'Method Not Allowed'});
};
