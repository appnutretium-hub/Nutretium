/**
 * netlify/functions/contact.js — NUTRETIUM
 * Formulario público persistido en Netlify Blobs.
 * Valida entrada y limita abuso sin convertir errores internos en éxitos falsos.
 */
'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');
const CORS = cabecerasCORS('POST, OPTIONS');

const MAX_NAME = 100;
const MAX_EMAIL = 200;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 2000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const json = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

function clientKey(event, email) {
  const ip = String(
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    event.headers?.['client-ip'] ||
    ''
  ).split(',')[0].trim();
  return crypto.createHash('sha256').update(`${ip}|${String(email).toLowerCase()}`).digest('hex');
}

async function consumeRateLimit(store, event, email) {
  // Si Blobs no está disponible no se inventa un bloqueo; el guardado posterior
  // decidirá si el servicio está operativo.
  if (!store) return { allowed: true };
  const key = `rate-${clientKey(event, email)}`;
  const now = Date.now();
  let state = null;
  try { state = await store.get(key, { type: 'json' }); } catch { state = null; }
  if (!state || !Number.isFinite(Number(state.startedAt)) || now - Number(state.startedAt) >= WINDOW_MS) {
    state = { startedAt: now, count: 0 };
  }
  const count = Number(state.count) || 0;
  if (count >= MAX_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - Number(state.startedAt))) / 1000));
    return { allowed: false, retryAfter };
  }
  await store.setJSON(key, { startedAt: Number(state.startedAt), count: count + 1 });
  return { allowed: true };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido.' }); }

  const name = clean(body.name, MAX_NAME);
  const email = clean(body.email, MAX_EMAIL).toLowerCase();
  const subject = clean(body.subject || '(sin asunto)', MAX_SUBJECT);
  const message = clean(body.message, MAX_MESSAGE);

  if (!name || !email || !message) return json(400, { error: 'Nombre, email y mensaje son obligatorios.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Email inválido.' });
  if (name.length < 2) return json(400, { error: 'El nombre es demasiado corto.' });
  if (message.length < 10) return json(400, { error: 'El mensaje debe tener al menos 10 caracteres.' });

  const store = getBlobStore('contact-messages');
  if (!store) {
    console.error('[Contact] Netlify Blobs no disponible');
    return json(503, { error: 'El formulario no está disponible temporalmente. Contacta con Nutretium por teléfono o inténtalo más tarde.' });
  }

  try {
    const rate = await consumeRateLimit(store, event, email);
    if (!rate.allowed) {
      return {
        statusCode: 429,
        headers: { ...CORS, 'Retry-After': String(rate.retryAfter) },
        body: JSON.stringify({ error: 'Has enviado varias solicitudes seguidas. Espera unos minutos antes de volver a intentarlo.' }),
      };
    }

    const record = {
      id: crypto.randomUUID(),
      name,
      email,
      subject,
      message,
      createdAt: new Date().toISOString(),
      read: false,
    };
    await store.setJSON(record.id, record);
    console.log('[Contact]', JSON.stringify({ id: record.id, subject: record.subject }));
    return json(200, { success: true, message: 'Mensaje recibido.' });
  } catch (err) {
    console.error('[Contact] No se pudo persistir el mensaje:', err?.message || err);
    return json(503, { error: 'No hemos podido registrar el mensaje. Inténtalo de nuevo en unos minutos.' });
  }
};
