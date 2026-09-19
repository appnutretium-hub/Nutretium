'use strict';

const { cabecerasCORS } = require('../lib/cors');
const { requireStaff } = require('../lib/staff');
const { getBlobStore } = require('../lib/blob-store');
const store = require('../lib/enterprise-store');
const actions = require('../lib/enterprise-actions');
const schema = require('../lib/enterprise-schema');
const provider = require('../lib/provider-client');
const CORS = cabecerasCORS('POST, OPTIONS');
const response = (statusCode, body) => ({ statusCode, headers: { ...CORS, 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

function purchasedMap(order) {
  const map = new Map();
  for (const item of order.items || []) map.set(String(item.code || item.sku || ''), Number(item.qty || 0));
  return map;
}

function normalizeInspection(lines, order) {
  if (!Array.isArray(lines) || !lines.length) throw Object.assign(new Error('Faltan las líneas inspeccionadas.'), { statusCode: 400 });
  const bought = purchasedMap(order);
  const totals = new Map();
  const normalized = lines.map(line => {
    const sku = String(line.sku || '').trim();
    const qty = Number(line.qty);
    const disposition = String(line.disposition || 'quarantine');
    const warehouseId = String(line.warehouseId || '').trim();
    if (!sku || !Number.isInteger(qty) || qty < 1 || !['restock', 'quarantine', 'discard'].includes(disposition)) throw Object.assign(new Error('Línea de inspección no válida.'), { statusCode: 400 });
    if (disposition === 'restock' && !warehouseId) throw Object.assign(new Error('Las unidades repuestas necesitan almacén.'), { statusCode: 400 });
    totals.set(sku, (totals.get(sku) || 0) + qty);
    return { sku, qty, disposition, warehouseId: warehouseId || null, note: String(line.note || '').slice(0, 300) };
  });
  for (const [sku, qty] of totals) if (!bought.has(sku) || qty > bought.get(sku)) throw Object.assign(new Error(`La devolución supera lo comprado para ${sku}.`), { statusCode: 409 });
  return normalized;
}

async function adjustRestock(lines, reference, auth) {
  const updated = [];
  for (const line of lines.filter(item => item.disposition === 'restock')) {
    const id = `${line.warehouseId}:${line.sku}`;
    const current = await store.get('inventory', id) || { id, sku: line.sku, warehouseId: line.warehouseId, onHand: 0, reserved: 0, reorderPoint: 0, reorderQty: 0 };
    const changed = actions.adjustInventory(current, { delta: line.qty, reason: 'customer-return', reference });
    if (!changed.ok) throw Object.assign(new Error(changed.error), { statusCode: 409 });
    const valid = schema.validate('inventory', changed.record);
    if (!valid.ok) throw Object.assign(new Error(valid.errors[0]), { statusCode: 400 });
    updated.push(await store.save('inventory', valid.data, auth, { id, reason: `return-restock:${reference}` }));
  }
  return updated;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  const auth = requireStaff(event, 'returns.manage');
  if (!auth.ok) return response(auth.statusCode, { error: auth.error });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'JSON no válido.' }); }
  try {
    const record = await store.get('returns', String(body.id || ''));
    if (!record) return response(404, { error: 'Devolución no encontrada.' });
    const orders = getBlobStore('redsys-orders');
    if (!orders) return response(503, { error: 'Pedidos no disponibles.' });
    const order = await orders.get(record.orderId, { type: 'json', consistency: 'strong' }).catch(() => null);
    if (!order || order.status !== 'PAID') return response(409, { error: 'El pedido original no es válido para devolución.' });
    if (body.action === 'approve') {
      if (record.status !== 'requested') return response(409, { error: 'La devolución no está pendiente de aprobación.' });
      let label = null;
      if (body.createLabel === true) {
        label = await provider.request('SHIPPING_PROVIDER', 'returns', { reference: record.id, orderId: record.orderId, recipient: { email: record.customerEmail }, destination: body.destination || null }, { idempotencyKey: `return-label:${record.id}` });
      }
      const next = { ...record, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: auth.email, returnProviderId: label?.id || label?.shipmentId || null, returnLabelUrl: label?.labelUrl || null, returnTrackingCode: label?.trackingCode || null };
      return response(200, { return: await store.save('returns', next, auth, { id: record.id, reason: 'return-approved' }) });
    }
    if (body.action === 'receive-and-inspect') {
      if (record.status !== 'approved') return response(409, { error: 'La devolución no está aprobada o ya fue recibida.' });
      if (record.restockedAt) return response(200, { return: record, idempotent: true });
      const inspection = normalizeInspection(body.lines, order);
      const inventory = await adjustRestock(inspection, record.id, auth);
      const next = { ...record, status: 'received', inspection, receivedAt: new Date().toISOString(), receivedBy: auth.email, restockedAt: new Date().toISOString() };
      return response(200, { return: await store.save('returns', next, auth, { id: record.id, reason: 'return-received-inspected' }), inventory });
    }
    return response(400, { error: 'Acción no reconocida.' });
  } catch (error) { return response(error.statusCode || (error.code === 'PROVIDER_NOT_CONFIGURED' ? 503 : 500), { error: error.message, code: error.code }); }
};

exports._test = { purchasedMap, normalizeInspection };
