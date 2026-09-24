'use strict';

const crypto = require('crypto');
const store = require('../lib/enterprise-store');
const provider = require('../lib/provider-client');
const effects = require('../lib/order-effects');
const finalize = require('../lib/order-finalize');
const compliance = require('../lib/compliance-gate');
const { valorarCarrito } = require('../lib/catalogo');
const { getBlobStore } = require('../lib/blob-store');
const SYSTEM = { email: 'subscription-worker@system.local', role: 'system' };

function nextDate(from, cadence) {
  const date = new Date(from || Date.now());
  const days = { weekly: 7, biweekly: 14 }[cadence];
  if (days) date.setUTCDate(date.getUTCDate() + days);
  else date.setUTCMonth(date.getUTCMonth() + ({ monthly: 1, bimonthly: 2, quarterly: 3 }[cadence] || 1));
  return date.toISOString();
}

function renewalKey(subscription, now = new Date()) { return `${subscription.id}:${now.toISOString().slice(0, 10)}`; }
function orderNumber(key) { return `S${crypto.createHash('sha256').update(key).digest('hex').toUpperCase().slice(0, 11)}`; }
function due(subscription, now = Date.now()) { return subscription.status === 'active' && subscription.nextAt && Date.parse(subscription.nextAt) <= now; }

async function mark(subscription, fields, reason) { return store.save('subscriptions', { ...subscription, ...fields }, SYSTEM, { id: subscription.id, reason }); }
async function notify(subscription, type, variables = {}) {
  const id = `${type}:${subscription.id}:${new Date().toISOString().slice(0, 10)}`;
  if (await store.get('notification-jobs', id).catch(() => null)) return;
  await store.save('notification-jobs', { id, templateKey: type, recipient: subscription.customerEmail, variables: { subscriptionId: subscription.id, ...variables }, status: 'queued' }, SYSTEM, { id, reason: 'subscription-worker' }).catch(() => {});
}

async function renew(subscription) {
  const key = renewalKey(subscription);
  const markerId = `renewal:${key}`;
  if (await store.get('commerce-settings', markerId).catch(() => null)) return { idempotent: true };
  if (!subscription.paymentToken) { await mark(subscription, { operationalStatus: 'awaiting_payment_token' }, 'subscription-awaiting-token'); await notify(subscription, 'subscription-action-required'); return { skipped: 'payment_token' }; }
  if (subscription.fulfillment !== 'pickup' && !subscription.shippingAddress) { await mark(subscription, { operationalStatus: 'awaiting_address' }, 'subscription-awaiting-address'); await notify(subscription, 'subscription-action-required'); return { skipped: 'address' }; }
  const priced = valorarCarrito(subscription.items || []);
  if (!priced.ok) { await mark(subscription, { operationalStatus: 'catalog_error', lastError: priced.errores[0] }, 'subscription-catalog-error'); return { skipped: 'catalog' }; }
  const gate = await compliance.checkItems(priced.lineas);
  if (!gate.ok) { await mark(subscription, { status: 'paused', operationalStatus: 'compliance_blocked', blockedSkus: gate.blocked }, 'subscription-compliance-block'); await notify(subscription, 'subscription-paused'); return { skipped: 'compliance' }; }
  const shippingCents = Math.max(0, Number(subscription.shippingCents || 0));
  const amountCents = priced.totalCents + shippingCents;
  const order = orderNumber(key);
  const reservations = await effects.reserveOrder(order, priced.lineas);
  try {
    const charge = await provider.request('RECURRING_PROVIDER', 'charges', { reference: order, customerEmail: subscription.customerEmail, paymentToken: subscription.paymentToken, amountCents, currency: 'EUR', description: `Renovación Nutretium ${subscription.id}` }, { idempotencyKey: `subscription:${key}` });
    if (!['captured', 'paid', 'succeeded'].includes(String(charge.status || '').toLowerCase())) throw Object.assign(new Error('El proveedor no confirmó el cobro recurrente.'), { code: 'PAYMENT_NOT_CAPTURED' });
    const orders = getBlobStore('redsys-orders');
    const index = getBlobStore('user-orders');
    if (!orders || !index) throw Object.assign(new Error('Almacenamiento de pedidos no disponible.'), { code: 'STORE_UNAVAILABLE' });
    const record = { order, email: subscription.customerEmail, guest: false, fulfillment: subscription.fulfillment === 'pickup' ? 'pickup' : 'shipping', envio: subscription.shippingAddress || null, cliente: subscription.customerName || '', telefono: subscription.phone || '', items: priced.lineas, retailSubtotal: priced.totalCents / 100, subtotal: priced.totalCents / 100, discount: 0, shipping: shippingCents / 100, amount: amountCents / 100, currency: '978', status: 'PAID', recurring: true, subscriptionId: subscription.id, providerChargeId: charge.id || charge.chargeId || null, reservations, benefits: {}, createdAt: new Date().toISOString() };
    await orders.setJSON(order, record);
    const previous = (await index.get(subscription.customerEmail, { type: 'json' }).catch(() => null)) || [];
    await index.setJSON(subscription.customerEmail, [order, ...previous.filter(value => value !== order)].slice(0, 100));
    await finalize.finalizePaid(record, { source: 'recurring-provider', sendCustomerEmail: true });
    await store.save('commerce-settings', { key: markerId, status: 'inactive', orderId: order, settledAt: new Date().toISOString() }, SYSTEM, { id: markerId, reason: 'subscription-renewal-marker' });
    await mark(subscription, { status: 'active', operationalStatus: 'operational', lastOrderId: order, lastChargedAt: new Date().toISOString(), nextAt: nextDate(subscription.nextAt, subscription.cadence), failureCount: 0, lastError: null }, 'subscription-renewed');
    await notify(subscription, 'subscription-renewed', { order, amount: (amountCents / 100).toFixed(2) });
    return { ok: true, order };
  } catch (error) {
    await effects.releaseReservations(order, reservations).catch(() => {});
    const failures = Number(subscription.failureCount || 0) + 1;
    await mark(subscription, { status: failures >= 3 ? 'past_due' : subscription.status, operationalStatus: 'payment_failed', failureCount: failures, lastError: String(error.message || '').slice(0, 500), lastAttemptAt: new Date().toISOString() }, 'subscription-renewal-failed');
    await notify(subscription, 'subscription-payment-failed', { attempt: failures });
    return { ok: false, error: error.code || 'renewal_failed' };
  }
}

// Comparación en tiempo constante: con !== se puede ir adivinando el secreto
// carácter a carácter midiendo cuánto tarda en fallar.
function mismoSecreto(recibido, esperado) {
  const a = Buffer.from(String(recibido || '')), b = Buffer.from(String(esperado));
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

exports.handler = async function (event = {}) {
  if (String(process.env.SUBSCRIPTION_WORKER_ENABLED || '').toLowerCase() !== 'true') return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'subscription_worker_disabled' }) };
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && !mismoSecreto(event.headers?.['x-nutretium-cron'], cronSecret)) return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  try {
    const rows = (await store.list('subscriptions', { limit: 1000 })).filter(item => due(item)).slice(0, 50);
    const results = [];
    for (const subscription of rows) results.push({ id: subscription.id, ...(await renew(subscription)) });
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed: results.length, results }) };
  } catch (error) { return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.code || 'subscription_worker_failed' }) }; }
};

exports._test = { nextDate, renewalKey, orderNumber, due };
