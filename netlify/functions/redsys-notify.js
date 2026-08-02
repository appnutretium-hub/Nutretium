/**
 * netlify/functions/redsys-notify.js — NUTRETIUM
 *
 * Notificación online (servidor a servidor) de Redsys.
 *
 * Redsys hace un POST a esta URL (Ds_Merchant_MerchantURL) con el resultado
 * REAL del pago. Es la ÚNICA fuente fiable de confirmación: el redirect del
 * navegador a /pago-ok es solo estético y se puede falsear, así que el cobro
 * SOLO debe darse por bueno cuando esta función valida la firma aquí.
 *
 * Flujo de verificación (HMAC_SHA256_V1):
 *   1. Base64-decodificar Ds_MerchantParameters → JSON → obtener Ds_Order.
 *   2. Derivar clave por pedido: 3DES-CBC del nº de pedido con la clave secreta.
 *   3. HMAC-SHA256 sobre la cadena Base64 de Ds_MerchantParameters.
 *   4. Convertir a Base64 URL-safe y comparar (constant-time) con Ds_Signature.
 *
 * Variables de entorno requeridas:
 *   REDSYS_SECRET_KEY — La misma clave usada para firmar la petición.
 */

'use strict';

const crypto = require('crypto');

const HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };

// ─── PERSISTENCIA (Netlify Blobs, opcional) ────────────────────────────────────

const { getBlobStore } = require('../lib/blob-store');

async function getStore() {
  return getBlobStore('redsys-orders');
}

// ─── CRIPTOGRAFÍA (idéntica a redsys.js) ───────────────────────────────────────

function deriveSigningKey(secretKeyBase64, orderNumber) {
  const keyBuffer = Buffer.from(secretKeyBase64, 'base64');
  const iv = Buffer.alloc(8, 0); // IV de 8 bytes a cero para 3DES-CBC
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
  cipher.setAutoPadding(false);

  const orderBuffer = Buffer.alloc(Math.ceil(orderNumber.length / 8) * 8, 0);
  orderBuffer.write(orderNumber, 'utf8');

  return Buffer.concat([cipher.update(orderBuffer), cipher.final()]);
}

function hmacBase64(dataBase64, signingKey) {
  return crypto.createHmac('sha256', signingKey).update(dataBase64).digest('base64');
}

/** Redsys firma las notificaciones en Base64 URL-safe. Normalizamos ambos lados. */
function toBase64Url(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ─── PARSEO DEL CUERPO ──────────────────────────────────────────────────────────

function parseBody(event) {
  const headers = event.headers || {};
  const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  const raw = event.body || '';

  if (ct.includes('application/json')) {
    return JSON.parse(raw);
  }
  // Por defecto Redsys notifica como application/x-www-form-urlencoded.
  // URLSearchParams decodifica el percent-encoding (%2B → "+", etc.).
  const params = new URLSearchParams(raw);
  return {
    Ds_SignatureVersion:   params.get('Ds_SignatureVersion'),
    Ds_MerchantParameters: params.get('Ds_MerchantParameters'),
    Ds_Signature:          params.get('Ds_Signature'),
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: 'Method Not Allowed' };
  }

  const secretKey = process.env.REDSYS_SECRET_KEY;
  if (!secretKey) {
    console.error('[Redsys-notify] Falta REDSYS_SECRET_KEY.');
    return { statusCode: 500, headers: HEADERS, body: 'Server misconfigured' };
  }

  let data;
  try { data = parseBody(event); }
  catch { return { statusCode: 400, headers: HEADERS, body: 'Bad body' }; }

  const { Ds_MerchantParameters, Ds_Signature } = data;
  if (!Ds_MerchantParameters || !Ds_Signature) {
    return { statusCode: 400, headers: HEADERS, body: 'Missing parameters' };
  }

  // ── Decodificar parámetros ─────────────────────────────────────────────────
  let params;
  try {
    const json = Buffer.from(Ds_MerchantParameters, 'base64').toString('utf8');
    params = JSON.parse(json);
  } catch {
    return { statusCode: 400, headers: HEADERS, body: 'Invalid parameters' };
  }

  const order = params.Ds_Order || params.DS_ORDER;
  if (!order) return { statusCode: 400, headers: HEADERS, body: 'Missing order' };

  // ── Verificar firma ────────────────────────────────────────────────────────
  let computed;
  try {
    const signingKey = deriveSigningKey(secretKey, order);
    computed = toBase64Url(hmacBase64(Ds_MerchantParameters, signingKey));
  } catch (err) {
    console.error('[Redsys-notify] Error verificando firma:', err);
    return { statusCode: 500, headers: HEADERS, body: 'Signature error' };
  }

  if (!safeEqual(computed, toBase64Url(Ds_Signature))) {
    console.warn('[Redsys-notify] FIRMA INVÁLIDA — pedido', order, '(posible fraude, se ignora)');
    return { statusCode: 403, headers: HEADERS, body: 'Invalid signature' };
  }

  // ── Interpretar resultado ──────────────────────────────────────────────────
  // Ds_Response 0000–0099 = operación autorizada. Cualquier otro valor = denegada.
  const responseCode = parseInt(params.Ds_Response, 10);
  const authorised = Number.isInteger(responseCode) && responseCode >= 0 && responseCode <= 99;

  // ── Persistir (para poder consultar el estado real del pedido) ─────────────
  // Se FUSIONA con lo que registró redsys.js al iniciar el pago (usuario y
  // artículos), porque la notificación no incluye esos datos.
  const resultado = {
    order,
    amount:       Number(params.Ds_Amount) / 100,  // Redsys manda céntimos
    currency:     params.Ds_Currency,
    responseCode: params.Ds_Response,
    authCode:     params.Ds_AuthorisationCode || null,
    paymentType:  params.Ds_PayMethod || null,     // p.ej. "z" = Bizum
    status:       authorised ? 'PAID' : 'FAILED',
    receivedAt:   new Date().toISOString(),
  };

  let record = resultado;
  try {
    const store = await getStore();
    if (store) {
      const previo = await store.get(order, { type: 'json' }).catch(() => null);
      record = { ...(previo || {}), ...resultado };
      await store.setJSON(order, record);
    }
  } catch (err) {
    // No hacemos fallar la notificación por un error de almacenamiento:
    // Redsys reintentaría y el cobro ya es válido. Solo lo registramos.
    console.error('[Redsys-notify] No se pudo persistir el pedido', order, err);
  }

  console.log('[Redsys-notify]', JSON.stringify({ order, status: record.status, responseCode: record.responseCode }));

  // Redsys solo necesita un 200 OK para dar por entregada la notificación.
  return { statusCode: 200, headers: HEADERS, body: 'OK' };
};
