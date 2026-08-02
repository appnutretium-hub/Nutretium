/**
 * netlify/functions/contact.js
 *
 * POST /.netlify/functions/contact
 *
 * Receives contact form submissions and stores them in Netlify Blobs.
 * Optionally sends an email notification via Netlify Emails (or any SMTP
 * service) if CONTACT_EMAIL env var is set.
 *
 * Environment variables:
 *   CONTACT_EMAIL  — address to forward messages to (optional)
 */

'use strict';

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const { getBlobStore } = require('../lib/blob-store');

async function getStore() {
  return getBlobStore('contact-messages');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido.' }) }; }

  const { name, email, subject = '(sin asunto)', message } = body;

  if (!name || !email || !message)
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Nombre, email y mensaje son obligatorios.' }) };

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email inválido.' }) };

  const record = {
    id:        crypto.randomUUID(),
    name:      String(name).slice(0, 100),
    email:     String(email).slice(0, 200).toLowerCase(),
    subject:   String(subject).slice(0, 200),
    message:   String(message).slice(0, 2000),
    createdAt: new Date().toISOString(),
    read:      false,
  };

  // Persist to Netlify Blobs
  const store = await getStore();
  if (store) {
    await store.setJSON(record.id, record);
  }

  // Optional: log to console (visible in Netlify function logs)
  console.log('[Contact]', JSON.stringify({ from: record.email, subject: record.subject }));

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ success: true, message: 'Mensaje recibido. Te responderemos pronto.' }),
  };
};
