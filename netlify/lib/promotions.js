'use strict';

/**
 * Motor de promociones de Nutretium.
 * La configuración vive en NUTRETIUM_COUPONS_JSON, nunca en el navegador.
 * Formato: [{"code":"WELCOME10","type":"percent","value":10,"minCents":3000,"maxDiscountCents":1500,"active":true}]
 */
function config() {
  try {
    const raw = JSON.parse(process.env.NUTRETIUM_COUPONS_JSON || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function normalizaCodigo(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

function busca(code) {
  const normalized = normalizaCodigo(code);
  if (!normalized) return null;
  return config().find(c => normalizaCodigo(c.code) === normalized && c.active !== false) || null;
}

function calcula(subtotalCents, code) {
  const subtotal = Math.max(0, Math.round(Number(subtotalCents) || 0));
  const coupon = busca(code);
  if (!coupon) return { ok:false, code:normalizaCodigo(code), subtotalCents:subtotal, discountCents:0, totalCents:subtotal, reason:'invalid' };
  const min = Math.max(0, Math.round(Number(coupon.minCents) || 0));
  if (subtotal < min) return { ok:false, code:normalizaCodigo(code), subtotalCents:subtotal, discountCents:0, totalCents:subtotal, reason:'minimum', minCents:min };

  let discount = 0;
  if (coupon.type === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(coupon.value) || 0));
    discount = Math.round(subtotal * pct / 100);
  } else if (coupon.type === 'fixed') {
    discount = Math.max(0, Math.round(Number(coupon.valueCents ?? coupon.value) || 0));
  }
  const cap = Math.max(0, Math.round(Number(coupon.maxDiscountCents) || 0));
  if (cap) discount = Math.min(discount, cap);
  discount = Math.min(discount, subtotal);

  return {
    ok: discount > 0,
    code: normalizaCodigo(code),
    label: String(coupon.label || normalizaCodigo(code)).slice(0,80),
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: subtotal - discount,
  };
}

module.exports = { config, normalizaCodigo, busca, calcula };
