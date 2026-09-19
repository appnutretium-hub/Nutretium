'use strict';

const crypto = require('crypto');

const TRANSITIONS = Object.freeze({
  'purchase-orders': {
    draft:['submitted','cancelled'], submitted:['approved','cancelled'], approved:['ordered','cancelled'], ordered:['partially_received','received','cancelled'], partially_received:['received','cancelled'], received:['closed'], closed:[], cancelled:[]
  },
  returns: {
    requested:['approved','rejected'], approved:['received','closed'], received:['refunded','closed'], refunded:['closed'], rejected:['closed'], closed:[]
  },
  shipments: {
    pending:['packed','cancelled'], packed:['shipped','cancelled'], shipped:['delivered','exception','returned'], exception:['shipped','returned','cancelled'], delivered:['returned'], returned:[], cancelled:[]
  },
  subscriptions: {
    trial:['active','cancelled'], active:['paused','past_due','cancelled'], paused:['active','cancelled'], past_due:['active','paused','cancelled'], cancelled:[]
  },
  'crm-tickets': { open:['pending','closed'], pending:['open','closed'], closed:['open'] },
  invoices: { draft:['issued','void'], issued:['paid','void'], paid:[], void:[] },
  'product-compliance': { draft:['under_review','blocked'], under_review:['approved','rejected','blocked'], approved:['blocked','under_review'], rejected:['under_review','blocked'], blocked:['under_review'] },
  'import-jobs': { queued:['validating','cancelled'], validating:['ready','failed','cancelled'], ready:['running','cancelled'], running:['completed','failed'], completed:[], failed:['queued'], cancelled:[] },
});

function transition(domain, record, nextStatus) {
  const map = TRANSITIONS[domain];
  if (!map) return { ok:false, error:'Este dominio no usa un flujo de estados controlado.' };
  const current = record.status || Object.keys(map)[0];
  if (!(map[current] || []).includes(nextStatus)) return { ok:false, error:`No se puede pasar de ${current} a ${nextStatus}.` };
  return { ok:true, record:{ ...record, status:nextStatus } };
}

function adjustInventory(record, { delta, reason, reference }) {
  const amount = Number(delta);
  if (!Number.isInteger(amount) || amount === 0) return { ok:false, error:'El ajuste debe ser un entero distinto de cero.' };
  const onHand = Number(record.onHand || 0) + amount;
  const reserved = Number(record.reserved || 0);
  if (onHand < 0 || reserved > onHand) return { ok:false, error:'El ajuste dejaría un stock imposible.' };
  const movements = Array.isArray(record.movements) ? record.movements.slice(-99) : [];
  movements.push({ id:crypto.randomUUID(), at:new Date().toISOString(), delta:amount, reason:String(reason || 'ajuste').slice(0,200), reference:String(reference || '').slice(0,120) });
  return { ok:true, record:{ ...record, onHand, available:onHand-reserved, movements } };
}

function reserveInventory(record, qty) {
  const amount = Number(qty);
  if (!Number.isInteger(amount) || amount <= 0) return { ok:false, error:'La reserva debe ser un entero positivo.' };
  const onHand = Number(record.onHand || 0), reserved = Number(record.reserved || 0);
  if (onHand - reserved < amount) return { ok:false, error:'No hay stock disponible suficiente.' };
  return { ok:true, record:{ ...record, reserved:reserved+amount, available:onHand-reserved-amount } };
}

function releaseInventory(record, qty) {
  const amount = Number(qty);
  if (!Number.isInteger(amount) || amount <= 0) return { ok:false, error:'La liberación debe ser un entero positivo.' };
  const reserved = Number(record.reserved || 0);
  if (amount > reserved) return { ok:false, error:'No se puede liberar más stock del reservado.' };
  const next = reserved - amount, onHand = Number(record.onHand || 0);
  return { ok:true, record:{ ...record, reserved:next, available:onHand-next } };
}

function loyaltyAdjust(record, points, reason) {
  const delta = Number(points);
  if (!Number.isInteger(delta) || delta === 0) return { ok:false, error:'Los puntos deben ser un entero distinto de cero.' };
  const balance = Number(record.balance || 0) + delta;
  if (balance < 0) return { ok:false, error:'La operación dejaría saldo negativo.' };
  const ledger = Array.isArray(record.ledger) ? record.ledger.slice(-199) : [];
  ledger.push({ id:crypto.randomUUID(), at:new Date().toISOString(), points:delta, reason:String(reason || '').slice(0,200) });
  return { ok:true, record:{ ...record, balance, ledger } };
}

function promotionDiscount(promotion, context = {}) {
  const now = Date.now();
  if (!promotion || promotion.status !== 'active' || promotion.archivedAt) return { ok:false, error:'Promoción no activa.', discountCents:0 };
  if (promotion.startsAt && Date.parse(promotion.startsAt) > now) return { ok:false, error:'Promoción aún no disponible.', discountCents:0 };
  if (promotion.endsAt && Date.parse(promotion.endsAt) < now) return { ok:false, error:'Promoción caducada.', discountCents:0 };
  const subtotal = Math.max(0, Math.round(Number(context.subtotalCents || 0)));
  if (promotion.minSpendCents && subtotal < Number(promotion.minSpendCents)) return { ok:false, error:'No se alcanza el importe mínimo.', discountCents:0 };
  if (Array.isArray(promotion.segments) && promotion.segments.length && !promotion.segments.includes(context.segment || 'retail')) return { ok:false, error:'Promoción no disponible para este segmento.', discountCents:0 };
  let discountCents = 0;
  if (promotion.type === 'percent') discountCents = Math.floor(subtotal * Number(promotion.value || 0) / 100);
  if (promotion.type === 'fixed') discountCents = Math.min(subtotal, Math.round(Number(promotion.value || 0) * 100));
  return { ok:true, discountCents:Math.max(0, discountCents), freeShipping:promotion.type === 'free_shipping', gift:promotion.type === 'gift' ? promotion.giftSku || null : null };
}

function chooseVariant(experiment, subject) {
  const variants = Array.isArray(experiment && experiment.variants) ? experiment.variants : [];
  if (!experiment || experiment.status !== 'running' || !variants.length) return null;
  const digest = crypto.createHash('sha256').update(`${experiment.key}:${subject || 'anonymous'}`).digest();
  const bucket = digest.readUInt32BE(0) % 10000;
  let cursor = 0;
  for (const variant of variants) {
    const weight = Math.max(0, Number(variant.weight || (100 / variants.length))) * 100;
    cursor += weight;
    if (bucket < cursor) return variant.key || variant.name || String(variants.indexOf(variant));
  }
  return variants[variants.length - 1].key || variants[variants.length - 1].name || 'control';
}

function margin({ revenueCents = 0, costCents = 0, shippingCostCents = 0, paymentFeeCents = 0 } = {}) {
  const revenue = Math.round(Number(revenueCents || 0));
  const costs = Math.round(Number(costCents || 0) + Number(shippingCostCents || 0) + Number(paymentFeeCents || 0));
  const grossProfitCents = revenue - costs;
  return { revenueCents:revenue, totalCostCents:costs, grossProfitCents, grossMarginPct:revenue > 0 ? Math.round((grossProfitCents / revenue) * 10000) / 100 : 0 };
}

module.exports = { TRANSITIONS, transition, adjustInventory, reserveInventory, releaseInventory, loyaltyAdjust, promotionDiscount, chooseVariant, margin };
