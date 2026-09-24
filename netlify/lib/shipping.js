'use strict';
const settings=require('./settings');
function env(name){return String(process.env[name]||'').trim()}
function envCents(name){const v=env(name);if(v==='')return null;const n=Number(v);return Number.isInteger(n)&&n>=0?n:null}
function envPolicy(){return{managed:false,enabled:env('SHIPPING_ENABLED')==='true',rateCents:envCents('SHIPPING_RATE_CENTS'),freeFromCents:envCents('SHIPPING_FREE_FROM_CENTS'),country:env('SHIPPING_COUNTRY')||'España',label:env('SHIPPING_LABEL')||'Envío',methods:[],source:'env'}}
async function policy(){
 const stored=await settings.read().catch(()=>null),s=stored?.shipping;
 if(s?.managed)return{managed:true,enabled:Boolean(s.enabled),rateCents:Number.isInteger(s.rateCents)&&s.rateCents>=0?s.rateCents:null,freeFromCents:Number.isInteger(s.freeFromCents)&&s.freeFromCents>=0?s.freeFromCents:null,country:String(s.country||'España').trim()||'España',label:String(s.label||'Envío').trim()||'Envío',methods:Array.isArray(s.methods)?s.methods:[],source:'settings'};
 return envPolicy();
}
function normalizeCountry(value){return String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function isSpain(value){return['espana','spain','es'].includes(normalizeCountry(value))}
function validPostalCode(country,postalCode){const cp=String(postalCode||'').trim();if(isSpain(country))return /^\d{5}$/.test(cp);return /^[0-9A-Za-z -]{3,12}$/.test(cp)}
function countryMatch(a,b){return normalizeCountry(a)===normalizeCountry(b)}
function matchingMethod(p,address){const methods=(Array.isArray(p?.methods)?p.methods:[]).filter(m=>m?.enabled&&Number.isInteger(m.rateCents)&&m.rateCents>=0),country=String(address&&(address.pais||address.country)||'').trim(),cp=String(address&&(address.cp||address.postalCode)||'').trim();if(!methods.length)return null;return methods.find(m=>{if(!countryMatch(country,m.country))return false;const prefixes=Array.isArray(m.postalPrefixes)?m.postalPrefixes.filter(Boolean):[];return prefixes.length===0||prefixes.some(prefix=>cp.toUpperCase().startsWith(String(prefix).toUpperCase()))})||false}
function quoteWithPolicy(p,{subtotalCents,address}){
 if(!p?.enabled)return{ok:false,reason:p?.managed?'shipping-disabled':'shipping-not-configured',error:p?.managed?'Los envíos online están desactivados en Ajustes.':'La política de envío todavía no está configurada.'};
 const country=String(address&&(address.pais||address.country)||'').trim(),cp=String(address&&(address.cp||address.postalCode)||'').trim();
 if(!country)return{ok:false,reason:'country-required',error:'Indica el país de envío.'};
 if(!validPostalCode(country,cp))return{ok:false,reason:'postal-code',error:'El código postal de envío no es válido.'};
 const method=matchingMethod(p,address);
 if(method===false)return{ok:false,reason:'zone-not-supported',error:'No hay una tarifa de envío activa para este código postal.'};
 if(method){const free=method.freeFromCents!==null&&method.freeFromCents!==undefined&&Number(subtotalCents)>=method.freeFromCents;return{ok:true,shippingCents:free?0:method.rateCents,free,label:method.name||p.label||'Envío',country:method.country||country,freeFromCents:method.freeFromCents,eta:method.eta||'',methodId:method.id||null,source:p.source||'unknown'}}
 if(!Number.isInteger(p.rateCents)||p.rateCents<0)return{ok:false,reason:'shipping-not-configured',error:'La tarifa de envío no está configurada.'};
 if(!countryMatch(country,p.country))return{ok:false,reason:'country-not-supported',error:`Actualmente el envío online solo está configurado para ${p.country||'España'}.`};
 const free=p.freeFromCents!==null&&Number(subtotalCents)>=p.freeFromCents;
 return{ok:true,shippingCents:free?0:p.rateCents,free,label:p.label||'Envío',country:p.country||'España',freeFromCents:p.freeFromCents,source:p.source||'unknown'};
}
async function configured(){const p=await policy();if(!p.enabled)return false;const methods=(Array.isArray(p.methods)?p.methods:[]).some(m=>m?.enabled&&Number.isInteger(m.rateCents)&&m.rateCents>=0);return Boolean(methods||(Number.isInteger(p.rateCents)&&p.rateCents>=0))}
async function quote(input){return quoteWithPolicy(await policy(),input)}
module.exports={configured,policy,quote,quoteWithPolicy,envPolicy,matchingMethod,validPostalCode};
