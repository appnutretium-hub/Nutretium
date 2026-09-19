'use strict';
const settings=require('./settings');
function envConfig(){try{const raw=JSON.parse(process.env.NUTRETIUM_COUPONS_JSON||'[]');return Array.isArray(raw)?raw:[]}catch{return[]}}
function normalizaCodigo(code){return String(code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32)}
function buscaEn(list,code){const n=normalizaCodigo(code);if(!n)return null;return(list||[]).find(c=>normalizaCodigo(c.code)===n&&c.active!==false)||null}
function calculaCon(list,subtotalCents,code){const subtotal=Math.max(0,Math.round(Number(subtotalCents)||0)),coupon=buscaEn(list,code);if(!coupon)return{ok:false,code:normalizaCodigo(code),subtotalCents:subtotal,discountCents:0,totalCents:subtotal,reason:'invalid'};const min=Math.max(0,Math.round(Number(coupon.minCents)||0));if(subtotal<min)return{ok:false,code:normalizaCodigo(code),subtotalCents:subtotal,discountCents:0,totalCents:subtotal,reason:'minimum',minCents:min};let discount=0;if(coupon.type==='percent'){const pct=Math.min(100,Math.max(0,Number(coupon.value)||0));discount=Math.round(subtotal*pct/100)}else if(coupon.type==='fixed'){discount=Math.max(0,Math.round(Number(coupon.valueCents??coupon.value)||0))}const cap=Math.max(0,Math.round(Number(coupon.maxDiscountCents)||0));if(cap)discount=Math.min(discount,cap);discount=Math.min(discount,subtotal);return{ok:discount>0,code:normalizaCodigo(code),label:String(coupon.label||normalizaCodigo(code)).slice(0,80),subtotalCents:subtotal,discountCents:discount,totalCents:subtotal-discount}}
function config(){return envConfig()}
function busca(code){return buscaEn(envConfig(),code)}
function calcula(subtotalCents,code){return calculaCon(envConfig(),subtotalCents,code)}
async function configAsync(){const s=await settings.read().catch(()=>null);return s&&Array.isArray(s.coupons)&&s.coupons.length?s.coupons:envConfig()}
async function calculaAsync(subtotalCents,code){return calculaCon(await configAsync(),subtotalCents,code)}
module.exports={config,normalizaCodigo,busca,calcula,configAsync,calculaAsync};