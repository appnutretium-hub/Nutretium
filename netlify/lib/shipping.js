'use strict';

function env(name){ return String(process.env[name] || '').trim(); }
function cents(name){ const v=env(name); if(v==='') return null; const n=Number(v); return Number.isInteger(n)&&n>=0?n:null; }

function configured(){
  return env('SHIPPING_ENABLED')==='true' && cents('SHIPPING_RATE_CENTS') !== null;
}

function quote({ subtotalCents, address }){
  if(!configured()) return { ok:false, reason:'shipping-not-configured', error:'La política de envío todavía no está configurada.' };
  const country=(address && (address.pais || address.country) || '').trim().toLowerCase();
  const allowed=(env('SHIPPING_COUNTRY') || 'España').toLowerCase();
  if(!country || country!==allowed) return { ok:false, reason:'country-not-supported', error:`Actualmente el envío online solo está configurado para ${env('SHIPPING_COUNTRY') || 'España'}.` };
  const cp=String(address && (address.cp || address.postalCode) || '').trim();
  if(!/^\d{5}$/.test(cp)) return { ok:false, reason:'postal-code', error:'El código postal de envío no es válido.' };

  const rate=cents('SHIPPING_RATE_CENTS');
  const freeFrom=cents('SHIPPING_FREE_FROM_CENTS');
  const free=freeFrom!==null && Number(subtotalCents)>=freeFrom;
  const shippingCents=free ? 0 : rate;
  return {
    ok:true,
    shippingCents,
    free,
    label:env('SHIPPING_LABEL') || 'Envío',
    country:env('SHIPPING_COUNTRY') || 'España',
    freeFromCents:freeFrom,
  };
}

module.exports={ configured, quote };
