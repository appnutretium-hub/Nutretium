/**
 * netlify/functions/redsys-notify.js — NUTRETIUM
 * Server-to-server Redsys notification. The browser redirect is never proof of payment.
 */
'use strict';

const crypto = require('crypto');
const HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };
const { getBlobStore } = require('../lib/blob-store');
const { sendEmail, buildOrderEmail } = require('../lib/email');
const enterprise = require('../lib/enterprise-store');
const webhooks = require('../lib/webhooks');
const SYSTEM = { email: 'system@nutretium.local', role: 'system' };

async function getStore() { return getBlobStore('redsys-orders'); }

function deriveSigningKey(secretKeyBase64, orderNumber) {
  const keyBuffer = Buffer.from(secretKeyBase64, 'base64');
  const iv = Buffer.alloc(8, 0);
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
  cipher.setAutoPadding(false);
  const orderBuffer = Buffer.alloc(Math.ceil(orderNumber.length / 8) * 8, 0);
  orderBuffer.write(orderNumber, 'utf8');
  return Buffer.concat([cipher.update(orderBuffer), cipher.final()]);
}
function hmacBase64(dataBase64, signingKey) { return crypto.createHmac('sha256', signingKey).update(dataBase64).digest('base64'); }
function toBase64Url(b64) { return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function safeEqual(a, b) { const ba = Buffer.from(String(a)), bb = Buffer.from(String(b)); return ba.length === bb.length && crypto.timingSafeEqual(ba, bb); }
function parseBody(event) {
  const headers = event.headers || {};
  const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  const raw = event.body || '';
  if (ct.includes('application/json')) return JSON.parse(raw);
  const params = new URLSearchParams(raw);
  return {
    Ds_SignatureVersion: params.get('Ds_SignatureVersion'),
    Ds_MerchantParameters: params.get('Ds_MerchantParameters'),
    Ds_Signature: params.get('Ds_Signature'),
  };
}

async function postProcess(record, wasPaidBefore) {
  const eventName = record.status === 'PAID' ? 'order.paid' : 'order.payment_failed';
  if (record.status === 'PAID' && !wasPaidBefore && !record.amountMismatch) {
    try {
      const reconciliationId = `redsys:${record.order}`;
      const existing = await enterprise.get('reconciliation', reconciliationId).catch(() => null);
      if (!existing) await enterprise.save('reconciliation', {
        id: reconciliationId,
        reference: record.order,
        source: 'redsys',
        status: 'matched',
        amountCents: Math.round(Number(record.amount || 0) * 100),
        currency: record.currency || '978',
        authCode: record.authCode || null,
      }, SYSTEM, { id: reconciliationId, create: true, reason: 'redsys-authorised' });
    } catch (err) { console.error('[Redsys-notify] Conciliación enterprise pendiente:', err.message); }
    try {
      const shipmentId = `order:${record.order}`;
      const existing = await enterprise.get('shipments', shipmentId).catch(() => null);
      if (!existing) await enterprise.save('shipments', {
        id: shipmentId,
        orderId: record.order,
        customerEmail: record.email || '',
        address: record.envio || null,
        status: 'pending',
      }, SYSTEM, { id: shipmentId, create: true, reason: 'payment-confirmed' });
    } catch (err) { console.error('[Redsys-notify] Fulfillment enterprise pendiente:', err.message); }
  }
  try { await webhooks.emit(eventName, { order: record.order, status: record.status, amount: record.amount, currency: record.currency }); }
  catch (err) { console.error('[Redsys-notify] Webhook no entregado:', err.message); }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: 'Method Not Allowed' };
  const secretKey = process.env.REDSYS_SECRET_KEY;
  if (!secretKey) return { statusCode: 500, headers: HEADERS, body: 'Server misconfigured' };
  let data;
  try { data = parseBody(event); } catch { return { statusCode: 400, headers: HEADERS, body: 'Bad body' }; }
  const { Ds_MerchantParameters, Ds_Signature } = data;
  if (!Ds_MerchantParameters || !Ds_Signature) return { statusCode: 400, headers: HEADERS, body: 'Missing parameters' };
  let params;
  try { params = JSON.parse(Buffer.from(Ds_MerchantParameters, 'base64').toString('utf8')); }
  catch { return { statusCode: 400, headers: HEADERS, body: 'Invalid parameters' }; }
  const order = params.Ds_Order || params.DS_ORDER;
  if (!order) return { statusCode: 400, headers: HEADERS, body: 'Missing order' };
  let computed;
  try { computed = toBase64Url(hmacBase64(Ds_MerchantParameters, deriveSigningKey(secretKey, order))); }
  catch { return { statusCode: 500, headers: HEADERS, body: 'Signature error' }; }
  if (!safeEqual(computed, toBase64Url(Ds_Signature))) return { statusCode: 403, headers: HEADERS, body: 'Invalid signature' };

  const responseCode = parseInt(params.Ds_Response, 10);
  const authorised = Number.isInteger(responseCode) && responseCode >= 0 && responseCode <= 99;
  const result = {
    order,
    amount: Number(params.Ds_Amount) / 100,
    currency: params.Ds_Currency,
    responseCode: params.Ds_Response,
    authCode: params.Ds_AuthorisationCode || null,
    paymentType: params.Ds_PayMethod || null,
    status: authorised ? 'PAID' : 'FAILED',
    receivedAt: new Date().toISOString(),
  };

  let record = result, wasPaidBefore = false;
  try {
    const store = await getStore();
    if (store) {
      const previous = await store.get(order, { type: 'json' }).catch(() => null);
      wasPaidBefore = previous && previous.status === 'PAID';
      record = { ...(previous || {}), ...result };
      const expectedCents = Math.round(Number(previous && previous.amount) * 100);
      const chargedCents = parseInt(params.Ds_Amount, 10);
      if (Number.isFinite(expectedCents) && expectedCents !== chargedCents) {
        record.amountMismatch = { esperado: expectedCents / 100, cobrado: chargedCents / 100 };
        console.error('[Redsys-notify] IMPORTE DISTINTO AL ESPERADO', order, expectedCents, chargedCents);
      }
      await store.setJSON(order, record);
    }
  } catch (err) { console.error('[Redsys-notify] No se pudo persistir el pedido', order, err); }

  console.log('[Redsys-notify]', JSON.stringify({ order, status: record.status, responseCode: record.responseCode }));

  if (authorised && !wasPaidBefore) {
    try {
      const { subject, html } = buildOrderEmail(record);
      await sendEmail({ to: process.env.ORDER_NOTIFICATION_EMAIL, subject, html });
    } catch (err) { console.error('[Redsys-notify] Fallo aviso de pedido:', err); }
  }
  await postProcess(record, wasPaidBefore);
  return { statusCode: 200, headers: HEADERS, body: 'OK' };
};

exports._test = { deriveSigningKey, hmacBase64, toBase64Url, safeEqual, parseBody, postProcess };
