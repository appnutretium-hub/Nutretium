'use strict';

const store = require('../lib/enterprise-store');
const provider = require('../lib/provider-client');
const SYSTEM = { email: 'shipping-provider@system.local', role: 'system' };
const allowed = new Set(['pending', 'packed', 'shipped', 'delivered', 'exception', 'returned', 'cancelled']);
const response = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  const raw = event.body || '';
  const verified = provider.verifyWebhook('SHIPPING_PROVIDER', raw, event.headers || {});
  if (!verified.ok) return response(401, { error: verified.error });
  let payload;
  try { payload = JSON.parse(raw); } catch { return response(400, { error: 'JSON no válido.' }); }
  const providerId = String(payload.shipmentId || payload.id || '');
  const status = String(payload.status || '');
  if (!providerId || !allowed.has(status)) return response(400, { error: 'Evento de transporte no válido.' });
  const rows = await store.list('shipments', { limit: 1000 });
  const record = rows.find(row => String(row.providerShipmentId || '') === providerId);
  if (!record) return response(202, { ok: true, ignored: 'unknown_shipment' });
  const events = Array.isArray(record.events) ? record.events.slice(-99) : [];
  const eventId = String(payload.eventId || `${providerId}:${status}:${payload.occurredAt || ''}`);
  if (events.some(item => item.id === eventId)) return response(200, { ok: true, idempotent: true });
  events.push({ id: eventId, status, occurredAt: payload.occurredAt || new Date().toISOString(), detail: String(payload.detail || '').slice(0, 500) });
  await store.save('shipments', { ...record, status, events, trackingCode: payload.trackingCode || record.trackingCode || null, trackingUrl: payload.trackingUrl || record.trackingUrl || null, providerUpdatedAt: new Date().toISOString() }, SYSTEM, { id: record.id, reason: `shipping-webhook:${status}` });
  return response(200, { ok: true });
};
