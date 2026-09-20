'use strict';
const settings=require('./settings');

function env(name){return String(process.env[name]||'').trim()}
function envCents(name){const v=env(name);if(v==='')return null;const n=Number(v);return Number.isInteger(n)&&n>=0?n:null}
function envPolicy(){return{managed:false,enabled:env('SHIPPING_ENABLED')==='true',rateCents:envCents('SHIPPING_RATE_CENTS'),freeFromCents:envCents('SHIPPING_FREE_FROM_CENTS'),country:env('SHIPPING_COUNTRY')||'España',label:env('SHIPPING_LABEL')||'Envío',source:'env'}}
async function policy(){
 const stored=await settings.read().catch(()=>null);
 const s=stored?.shipping;
 if(s?.managed)return{managed:true,enabled:Boolean(s.enabled),rateCents:Number.isInteger(s.rateCents)&&s.rateCents>=0?s.rateCents:null,freeFromCents:Number.isInteger(s.freeFromCents)&&s.freeFromCents>=0?s.freeFromCents:null,country:String(s.country||'España').trim()||'España',label:String(s.label||'Envío').trim()||'Envío',source:'settings'};
 return envPolicy();
}
function quoteWithPolicy(p,{subtotalCents,address}){
 if(!p?.enabled)return{ok:false,reason:p?.managed?'shipping-disabled':'shipping-not-configured',error:p?.managed?'Los envíos online están desactivados en Ajustes.':'La política de envío todavía no está configurada.'};
 if(!Number.isInteger(p.rateCents)||p.rateCents<0)return{ok:false,reason:'shipping-not-configured',error:'La tarifa de envío no está configurada.'};
 const country=String(address&&(address.pais||address.country)||'').trim().toLowerCase();
 const allowed=String(p.country||'España').trim().toLowerCase();
 if(!country||country!==allowed)return{ok:false,reason:'country-not-supported',error:`Actualmente el envío online solo está configurado para ${p.country||'España'}.`};
 const cp=String(address&&(address.cp||address.postalCode)||'').trim();
 if(!/^\d{5}$/.test(cp))return{ok:false,reason:'postal-code',error:'El código postal de envío no es válido.'};
 const free=p.freeFromCents!==null&&Number(subtotalCents)>=p.freeFromCents;
 return{ok:true,shippingCents:free?0:p.rateCents,free,label:p.label||'Envío',country:p.country||'España',freeFromCents:p.freeFromCents,source:p.source||'unknown'};
}
async function configured(){const p=await policy();return Boolean(p.enabled&&Number.isInteger(p.rateCents)&&p.rateCents>=0)}
async function quote(input){return quoteWithPolicy(await policy(),input)}
module.exports={configured,policy,quote,quoteWithPolicy,envPolicy};
