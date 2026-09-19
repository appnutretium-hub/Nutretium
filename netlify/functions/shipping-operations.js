'use strict';

const { cabecerasCORS } = require('../lib/cors');
const { requireStaff } = require('../lib/staff');
const store = require('../lib/enterprise-store');
const provider = require('../lib/provider-client');
const CORS = cabecerasCORS('POST, OPTIONS');
const response = (statusCode, body) => ({ statusCode, headers: { ...CORS, 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

function safeUrl(value) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

async function shipment(id) {
  const record = await store.get('shipments', id);
  if (!record) throw Object.assign(new Error('Envío no encontrado.'), { statusCode: 404 });
  return record;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  const auth = requireStaff(event, 'shipping.manage');
  if (!auth.ok) return response(auth.statusCode, { error: auth.error });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'JSON no válido.' }); }
  try {
    const record = await shipment(String(body.id || ''));
    if (body.action === 'create-label') {
      if (record.providerShipmentId && record.labelUrl) return response(200, { shipment: record, idempotent: true });
      if (!record.address) return response(409, { error: 'El envío no tiene una dirección validada.' });
      const data = await provider.request('SHIPPING_PROVIDER', 'shipments', { reference: record.orderId, recipient: { name: record.customerName || '', email: record.customerEmail || '', phone: record.phone || '' }, address: record.address, parcels: Array.isArray(body.parcels) && body.parcels.length ? body.parcels : [{ weightGrams: Number(body.weightGrams || record.weightGrams || 0) }], service: body.service || record.service || null }, { idempotencyKey: `shipping:${record.id}` });
      if (!data.id && !data.shipmentId) throw Object.assign(new Error('El transportista no devolvió identificador.'), { statusCode: 502 });
      const next = { ...record, provider: data.provider || 'configured-provider', providerShipmentId: String(data.id || data.shipmentId), trackingCode: data.trackingCode || null, trackingUrl: safeUrl(data.trackingUrl), labelUrl: safeUrl(data.labelUrl), status: data.status === 'shipped' ? 'shipped' : 'packed', providerUpdatedAt: new Date().toISOString() };
      return response(200, { shipment: await store.save('shipments', next, auth, { id: record.id, reason: 'provider-create-label' }) });
    }
    if (body.action === 'refresh') {
      if (!record.providerShipmentId) return response(409, { error: 'El envío todavía no existe en el transportista.' });
      const data = await provider.request('SHIPPING_PROVIDER', `shipments/${encodeURIComponent(record.providerShipmentId)}/status`, {}, { idempotencyKey: `shipping-status:${record.id}:${Math.floor(Date.now() / 60000)}` });
      const allowed = new Set(['pending', 'packed', 'shipped', 'delivered', 'exception', 'returned', 'cancelled']);
      const next = { ...record, status: allowed.has(data.status) ? data.status : record.status, trackingCode: data.trackingCode || record.trackingCode || null, trackingUrl: safeUrl(data.trackingUrl) || record.trackingUrl || null, providerUpdatedAt: new Date().toISOString() };
      return response(200, { shipment: await store.save('shipments', next, auth, { id: record.id, reason: 'provider-refresh' }) });
    }
    if (body.action === 'cancel') {
      if (!record.providerShipmentId) return response(409, { error: 'El envío todavía no existe en el transportista.' });
      await provider.request('SHIPPING_PROVIDER', `shipments/${encodeURIComponent(record.providerShipmentId)}/cancel`, { reason: String(body.reason || '').slice(0, 300) }, { idempotencyKey: `shipping-cancel:${record.id}` });
      const next = { ...record, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: auth.email };
      return response(200, { shipment: await store.save('shipments', next, auth, { id: record.id, reason: 'provider-cancel' }) });
    }
    return response(400, { error: 'Acción no reconocida.' });
  } catch (error) { return response(error.statusCode || 500, { error: error.message, code: error.code }); }
};

exports._test = { safeUrl };
