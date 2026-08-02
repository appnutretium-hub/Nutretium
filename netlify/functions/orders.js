/**
 * netlify/functions/orders.js — NUTRETIUM
 *
 * GET /.netlify/functions/orders
 * Cabecera:  Authorization: Bearer <token>
 *
 * Devuelve los pedidos del usuario autenticado, del más reciente al más
 * antiguo. El usuario se determina SIEMPRE a partir del token firmado, nunca
 * de un parámetro de la petición: así nadie puede pedir los pedidos de otro.
 *
 * Los pedidos se guardan en el store "redsys-orders" (clave = nº de pedido) y
 * el índice por usuario en "user-orders" (clave = email → array de pedidos).
 */

'use strict';

const { getBlobStore }        = require('../lib/blob-store');
const { verifyJWT, tokenFromHeader } = require('../lib/jwt');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type':  'application/json',
  'Cache-Control': 'no-store',
};

const MAX_PEDIDOS = 50;

/** Solo exponemos lo que la página necesita mostrar. */
function toPublic(rec) {
  return {
    order:      rec.order,
    status:     rec.status || 'PENDING',
    amount:     rec.amount,
    items:      Array.isArray(rec.items) ? rec.items : [],
    authCode:   rec.authCode || null,
    createdAt:  rec.createdAt || null,
    receivedAt: rec.receivedAt || null,
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // ── Autenticación ──────────────────────────────────────────────────────────
  const token = tokenFromHeader(event.headers);
  if (!token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Debes iniciar sesión.' }) };
  }

  let email;
  try {
    email = verifyJWT(token).email;
    if (!email) throw new Error('Token sin email');
  } catch {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Sesión caducada. Vuelve a iniciar sesión.' }) };
  }

  // ── Índice de pedidos del usuario ──────────────────────────────────────────
  const index = getBlobStore('user-orders');
  const store = getBlobStore('redsys-orders');

  if (!index || !store) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Almacenamiento no disponible.' }) };
  }

  const numeros = (await index.get(email, { type: 'json' }).catch(() => null)) || [];
  if (!numeros.length) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ orders: [] }) };
  }

  // ── Cargar cada pedido (en paralelo, acotado) ──────────────────────────────
  const registros = await Promise.all(
    numeros.slice(0, MAX_PEDIDOS).map(n => store.get(n, { type: 'json' }).catch(() => null))
  );

  const orders = registros
    // Defensa extra: aunque el índice es por email, comprobamos la propiedad.
    .filter(r => r && (!r.email || r.email === email))
    .map(toPublic);

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ orders }) };
};
