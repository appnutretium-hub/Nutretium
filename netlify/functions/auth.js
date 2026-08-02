/**
 * netlify/functions/auth.js
 *
 * Handles user registration, login, and profile fetch.
 *
 * Uses Netlify Blobs as a lightweight key-value store (no external DB needed).
 * Each user record is stored as a JSON blob keyed by email.
 *
 * In production you can swap the storage layer for FaunaDB, PlanetScale,
 * Supabase, or any other DB — only the read/write helpers need to change.
 *
 * Environment variables:
 *   JWT_SECRET  — Secret for signing JWT tokens (set in Netlify dashboard)
 */

'use strict';

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

// ─── Simple JWT (HS256) — no external dependency ─────────────────────────────

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJWT(payload, secret) {
  const header  = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body    = base64url(Buffer.from(JSON.stringify(payload)));
  const sig     = base64url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verifyJWT(token, secret) {
  const [header, body, sig] = token.split('.');
  const expected = base64url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());
  if (sig !== expected) throw new Error('Invalid token');
  return JSON.parse(Buffer.from(body, 'base64').toString());
}

// ─── Password hashing (PBKDF2) ────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

// ─── Storage helpers (Netlify Blobs) ─────────────────────────────────────────
// Netlify Blobs is available in the runtime as require('@netlify/blobs').
// We wrap it so the function degrades gracefully if the package isn't present
// (e.g. local dev without netlify dev).

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('users');
  } catch {
    return null; // local dev fallback — in-memory only
  }
}

const IN_MEMORY_USERS = {}; // fallback for local dev

async function readUser(email) {
  const store = await getStore();
  if (store) {
    const raw = await store.get(email, { type: 'json' }).catch(() => null);
    return raw;
  }
  return IN_MEMORY_USERS[email] || null;
}

async function writeUser(email, data) {
  const store = await getStore();
  if (store) {
    await store.setJSON(email, data);
  } else {
    IN_MEMORY_USERS[email] = data;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const JWT_SECRET = process.env.JWT_SECRET || 'nutretium-dev-secret-change-in-production';

  // ── REGISTER ───────────────────────────────────────────────────────────────
  if (body.action === 'register') {
    const { name, surname = '', email, password, phone = '' } = body;

    if (!name || !email || !password)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Nombre, email y contraseña son obligatorios.' }) };

    if (password.length < 8)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres.' }) };

    const emailLower = email.toLowerCase().trim();
    const existing   = await readUser(emailLower);
    if (existing)
      return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: 'Ya existe una cuenta con ese email.' }) };

    const id   = crypto.randomUUID();
    const user = {
      id, name: name.trim(), surname: surname.trim(),
      email: emailLower, phone: phone.trim(),
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    await writeUser(emailLower, user);

    const token   = signJWT({ sub: id, email: emailLower, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }, JWT_SECRET);
    const profile = { id, name: user.name, surname: user.surname, email: emailLower, phone: user.phone, token };

    return { statusCode: 201, headers: CORS, body: JSON.stringify({ user: profile }) };
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (body.action === 'login') {
    const { email, password } = body;
    if (!email || !password)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email y contraseña son obligatorios.' }) };

    const emailLower = email.toLowerCase().trim();
    const user       = await readUser(emailLower);

    if (!user || !verifyPassword(password, user.passwordHash))
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Email o contraseña incorrectos.' }) };

    const token   = signJWT({ sub: user.id, email: emailLower, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }, JWT_SECRET);
    const profile = { id: user.id, name: user.name, surname: user.surname, email: emailLower, phone: user.phone, token };

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ user: profile }) };
  }

  // ── PROFILE (GET via POST with token) ─────────────────────────────────────
  if (body.action === 'profile') {
    const { token } = body;
    if (!token)
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token requerido.' }) };

    let claims;
    try { claims = verifyJWT(token, JWT_SECRET); }
    catch { return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token inválido o expirado.' }) }; }

    const user = await readUser(claims.email);
    if (!user)
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Usuario no encontrado.' }) };

    const profile = { id: user.id, name: user.name, surname: user.surname, email: user.email, phone: user.phone };
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ user: profile }) };
  }

  return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Acción no reconocida.' }) };
};
