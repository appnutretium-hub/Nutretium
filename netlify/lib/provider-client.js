'use strict';

const crypto = require('crypto');
const resilience = require('./provider-resilience');

function env(prefix, key) {
  return process.env[`${prefix}_${key}`] || '';
}

function configuration(prefix) {
  const raw = env(prefix, 'URL').trim();
  if (!raw) return { ok: false, reason: `${prefix}_URL no configurada` };
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: `${prefix}_URL no válida` }; }
  if (url.protocol !== 'https:') return { ok: false, reason: `${prefix}_URL debe usar HTTPS` };
  const token = env(prefix, 'TOKEN');
  const secret = env(prefix, 'SECRET');
  if (!token && !secret) return { ok: false, reason: `${prefix}_TOKEN o ${prefix}_SECRET no configurado` };
  return { ok: true, url, token, secret };
}

function signature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function request(prefix, path, payload, options = {}) {
  const cfg = configuration(prefix);
  if (!cfg.ok) throw Object.assign(new Error(cfg.reason), { code: 'PROVIDER_NOT_CONFIGURED', statusCode: 503 });
  const body = JSON.stringify(payload || {});
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Nutretium-Enterprise/1.0' };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  if (cfg.secret) {
    headers['X-Nutretium-Timestamp'] = timestamp;
    headers['X-Nutretium-Signature'] = signature(cfg.secret, timestamp, body);
  }
  if (options.idempotencyKey) headers['Idempotency-Key'] = String(options.idempotencyKey).slice(0, 200);
  const target = new URL(String(path || '').replace(/^\/+/, ''), cfg.url.href.endsWith('/') ? cfg.url : `${cfg.url.href}/`);
  if (target.origin !== cfg.url.origin) throw Object.assign(new Error('Ruta de proveedor no permitida.'), { statusCode: 400 });
  return resilience.execute(prefix, async () => {
    let response;
    try { response = await fetch(target, { method: options.method || 'POST', headers, body, signal: AbortSignal.timeout(Number(options.timeoutMs || 12000)) }); }
    catch (error) { throw Object.assign(new Error('No se pudo conectar con el proveedor.'), { code: 'PROVIDER_UNAVAILABLE', statusCode: 502, cause: error }); }
    const text = await response.text(); let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    if (!response.ok) throw Object.assign(new Error(data.error || data.message || `Proveedor respondió ${response.status}.`), { code: 'PROVIDER_REJECTED', statusCode: 502, providerStatus: response.status });
    return data;
  }, options.resilience);
}

function verifyWebhook(prefix, rawBody, headers = {}) {
  const secret = env(prefix, 'WEBHOOK_SECRET') || env(prefix, 'SECRET');
  if (!secret) return { ok: false, error: 'Webhook no configurado.' };
  const timestamp = String(headers['x-provider-timestamp'] || headers['X-Provider-Timestamp'] || headers['x-nutretium-timestamp'] || '');
  const supplied = String(headers['x-provider-signature'] || headers['X-Provider-Signature'] || headers['x-nutretium-signature'] || '');
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() - seconds * 1000) > 5 * 60 * 1000) return { ok: false, error: 'Webhook caducado.' };
  return safeEqual(supplied.replace(/^sha256=/i, ''), signature(secret, timestamp, String(rawBody || ''))) ? { ok: true } : { ok: false, error: 'Firma de webhook no válida.' };
}

module.exports = { configuration, request, signature, verifyWebhook, safeEqual };
