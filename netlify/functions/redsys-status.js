/**
 * netlify/functions/redsys-status.js — NUTRETIUM
 *
 * GET /.netlify/functions/redsys-status?order=XXXXXXXXXXXX
 *
 * Devuelve el estado REAL de un pedido, tal y como lo confirmó la
 * notificación servidor-a-servidor de Redsys (redsys-notify.js), leído
 * desde Netlify Blobs. La página /pago-ok la usa para NO fiarse solo del
 * redirect del navegador.
 *
 * Respuesta:
 *   { order, found, status }  status ∈ "PAID" | "FAILED" | "PENDING"
 *   (+ amount, authCode, responseCode cuando found = true)
 */

'use strict';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('redsys-orders');
  } catch { return null; }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const order = (event.queryStringParameters || {}).order;
  // El nº de pedido de Redsys es alfanumérico de 4 a 12 caracteres.
  if (!order || !/^[0-9A-Za-z]{4,12}$/.test(order)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Pedido inválido.' }) };
  }

  const store = await getStore();
  if (!store) {
    // Sin almacenamiento no podemos confirmar; el frontend lo tratará como pendiente.
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ order, found: false, status: 'PENDING' }) };
  }

  let rec = null;
  try { rec = await store.get(order, { type: 'json' }); } catch { rec = null; }

  if (!rec) {
    // Aún no llegó la notificación de Redsys (o el pedido no existe).
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ order, found: false, status: 'PENDING' }) };
  }

  // Solo exponemos campos no sensibles.
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      order,
      found:        true,
      status:       rec.status,        // "PAID" | "FAILED"
      amount:       rec.amount,        // céntimos
      authCode:     rec.authCode || null,
      responseCode: rec.responseCode,
    }),
  };
};
