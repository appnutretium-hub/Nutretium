'use strict';

const DOMAIN_DEFS = Object.freeze({
  warehouses: { permission:'inventory.manage', required:['code','name'], statuses:['active','inactive'] },
  inventory: { permission:'inventory.manage', required:['sku','warehouseId'], numeric:['onHand','reserved','reorderPoint','reorderQty'] },
  suppliers: { permission:'purchasing.manage', required:['name'], statuses:['active','blocked','pending_review'] },
  'purchase-orders': { permission:'purchasing.manage', required:['supplierId','currency','lines'], statuses:['draft','submitted','approved','ordered','partially_received','received','closed','cancelled'] },
  returns: { permission:'returns.manage', required:['orderId','reason'], statuses:['requested','approved','rejected','received','refunded','closed'] },
  shipments: { permission:'shipping.manage', required:['orderId'], statuses:['pending','packed','shipped','delivered','exception','returned','cancelled'] },
  'shipping-rules': { permission:'shipping.manage', required:['name','country'], statuses:['active','inactive'] },
  promotions: { permission:'marketing.manage', required:['code','type'], statuses:['draft','active','paused','expired','archived'] },
  bundles: { permission:'marketing.manage', required:['name','items'], statuses:['draft','active','paused','archived'] },
  subscriptions: { permission:'subscriptions.manage', required:['customerEmail','items','cadence'], statuses:['trial','active','paused','past_due','cancelled'] },
  loyalty: { permission:'loyalty.manage', required:['customerEmail'], statuses:['active','suspended'] },
  'crm-tickets': { permission:'crm.manage', required:['subject','customerEmail'], statuses:['open','pending','closed'] },
  'notification-templates': { permission:'marketing.manage', required:['key','channel','subject','body'], statuses:['draft','active','archived'] },
  'notification-jobs': { permission:'marketing.manage', required:['templateKey','recipient'], statuses:['queued','processing','sent','failed','cancelled'] },
  experiments: { permission:'marketing.manage', required:['key','variants'], statuses:['draft','running','paused','completed','archived'] },
  'feature-flags': { permission:'marketing.manage', required:['key'], statuses:['active','inactive'] },
  webhooks: { permission:'integrations.manage', required:['name','url','events'], statuses:['active','paused','disabled'] },
  integrations: { permission:'integrations.manage', required:['key','provider'], statuses:['configured','pending','disabled','error'] },
  'b2b-accounts': { permission:'finance.read', required:['companyName','email'], statuses:['pending','active','suspended','closed'] },
  'price-lists': { permission:'finance.read', required:['name','currency'], statuses:['draft','active','archived'] },
  'product-compliance': { permission:'compliance.read', required:['sku','market'], statuses:['draft','under_review','approved','rejected','blocked'] },
  'product-costs': { permission:'finance.read', required:['sku','currency','unitCost'], numeric:['unitCost','landedCost'] },
  invoices: { permission:'finance.read', required:['orderId','customerEmail','currency'], statuses:['draft','issued','paid','void'] },
  reconciliation: { permission:'finance.read', required:['reference','source'], statuses:['unmatched','matched','review','ignored'] },
  media: { permission:'media.manage', required:['name','url','kind'], statuses:['active','archived'] },
  'saved-carts': { permission:'orders.manage', required:['customerEmail','items'], statuses:['active','converted','abandoned','archived'] },
  'privacy-requests': { permission:'privacy.manage', required:['customerEmail','type'], statuses:['requested','verified','processing','completed','rejected'] },
  'import-jobs': { permission:'imports.manage', required:['type'], statuses:['queued','validating','ready','running','completed','failed','cancelled'] },
  'analytics-settings': { permission:'analytics.read', required:['key'] },
  'tax-rules': { permission:'finance.read', required:['name','country'], statuses:['active','inactive'] },
});

const MAX_TEXT = 5000;
const MAX_ARRAY = 500;
const MAX_DEPTH = 8;
const RESERVED = new Set(['__proto__','prototype','constructor']);

function cleanValue(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('La estructura supera la profundidad permitida.');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, MAX_TEXT).trim();
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) throw new Error('La lista supera el máximo permitido.');
    return value.map((v) => cleanValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (RESERVED.has(key)) continue;
      if (key.length > 80) throw new Error('Hay un nombre de campo demasiado largo.');
      out[key] = cleanValue(val, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, MAX_TEXT);
}

function validate(domain, raw, { partial = false } = {}) {
  const def = DOMAIN_DEFS[domain];
  if (!def) return { ok:false, errors:['Dominio no reconocido.'] };
  let data;
  try { data = cleanValue(raw || {}); }
  catch (err) { return { ok:false, errors:[err.message] }; }
  const errors = [];
  if (!partial) {
    for (const field of def.required || []) {
      const v = data[field];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) errors.push(`Falta ${field}.`);
    }
  }
  if (data.status !== undefined && def.statuses && !def.statuses.includes(data.status)) errors.push(`Estado no válido para ${domain}.`);
  for (const field of def.numeric || []) {
    if (data[field] !== undefined && data[field] !== null && (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0)) errors.push(`${field} debe ser un número no negativo.`);
  }
  if (domain === 'promotions') {
    const types = ['percent','fixed','free_shipping','bundle','gift'];
    if (data.type && !types.includes(data.type)) errors.push('Tipo de promoción no válido.');
    if (data.type === 'percent' && (Number(data.value) <= 0 || Number(data.value) > 100)) errors.push('El porcentaje debe estar entre 0 y 100.');
    if (data.type === 'fixed' && Number(data.value) <= 0) errors.push('El descuento fijo debe ser mayor que cero.');
  }
  if (domain === 'product-compliance' && data.status === 'approved') {
    if (!data.evidenceComplete || !Array.isArray(data.evidence) || data.evidence.length === 0) errors.push('No se puede aprobar cumplimiento sin evidencia documental completa.');
  }
  if (domain === 'inventory' && data.reserved !== undefined && data.onHand !== undefined && Number(data.reserved) > Number(data.onHand)) errors.push('El stock reservado no puede superar el stock físico.');
  if (domain === 'shipping-rules' && data.priceCents !== undefined && (!Number.isInteger(Number(data.priceCents)) || Number(data.priceCents) < 0)) errors.push('priceCents debe ser un entero no negativo.');
  if (domain === 'tax-rules' && data.rate !== undefined && (Number(data.rate) < 0 || Number(data.rate) > 100)) errors.push('El tipo impositivo debe estar entre 0 y 100.');
  return { ok: errors.length === 0, errors, data };
}

function definition(domain) { return DOMAIN_DEFS[domain] || null; }
function domains() { return Object.keys(DOMAIN_DEFS); }

module.exports = { DOMAIN_DEFS, validate, definition, domains, cleanValue };
