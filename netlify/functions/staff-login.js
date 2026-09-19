'use strict';

const crypto = require('crypto');
const usuarios = require('../lib/usuarios');
const { signJWT, secretConfigured } = require('../lib/jwt');
const { roleFor } = require('../lib/staff');
const { secretFor, verify: verifyTotp } = require('../lib/totp');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');

const CORS = cabecerasCORS('POST, OPTIONS');
const response = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { ...CORS, 'Cache-Control': 'no-store', ...headers },
  body: JSON.stringify(body),
});

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || '').split(':');
    const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(attempt, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function attemptStore() {
  return getBlobStore('staff-auth-attempts');
}

function attemptKey(email) {
  return crypto.createHash('sha256').update(String(email || '').toLowerCase()).digest('hex');
}

async function checkThrottle(email) {
  const store = attemptStore();
  if (!store) return { ok: true };
  const now = Date.now();
  const record = await store.get(attemptKey(email), { type: 'json' }).catch(() => null);
  if (record && Number(record.until) > now) {
    return { ok: false, retryAfter: Math.ceil((Number(record.until) - now) / 1000) };
  }
  return { ok: true };
}

async function failAttempt(email) {
  const store = attemptStore();
  if (!store) return;
  const key = attemptKey(email);
  const now = Date.now();
  const record = (await store.get(key, { type: 'json' }).catch(() => null)) || {
    fails: 0,
    first: now,
    until: 0,
  };
  const insideWindow = now - Number(record.first || 0) < 15 * 60 * 1000;
  const fails = (insideWindow ? Number(record.fails || 0) : 0) + 1;
  await store.setJSON(key, {
    fails,
    first: insideWindow ? record.first : now,
    until: fails >= 5 ? now + 15 * 60 * 1000 : 0,
  });
}

async function clearAttempts(email) {
  const store = attemptStore();
  if (store) await store.delete(attemptKey(email)).catch(() => {});
}

function staffMfaRequired() {
  return String(process.env.REQUIRE_STAFF_MFA || 'false').toLowerCase() === 'true';
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  if (!secretConfigured()) return response(503, { error: 'Sesiones no disponibles.' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'JSON no válido.' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const mfaCode = String(body.mfaCode || '').replace(/\s/g, '');
  const wait = await checkThrottle(email);
  if (!wait.ok) {
    return response(
      429,
      { error: 'Demasiados intentos. Prueba más tarde.' },
      { 'Retry-After': String(wait.retryAfter) }
    );
  }

  const user = await usuarios.lee(email);
  const role = roleFor(email);
  if (!user || role === 'client' || !verifyPassword(password, user.passwordHash)) {
    await failAttempt(email);
    return response(401, { error: 'Credenciales incorrectas.' });
  }

  const requireMfa = staffMfaRequired();
  const secret = secretFor(email);
  let mfaVerified = false;

  if (requireMfa) {
    if (!secret) {
      return response(503, {
        error: 'MFA está activado para el personal, pero esta cuenta aún no tiene TOTP configurado.',
        mfaSetupRequired: true,
      });
    }

    // La primera petición con contraseña válida sirve para descubrir que esta
    // cuenta necesita MFA. No cuenta como intento fallido si el código está vacío.
    if (!mfaCode) {
      return response(401, {
        error: 'Introduce el código de 6 dígitos de tu aplicación de autenticación.',
        mfaRequired: true,
      });
    }

    if (!verifyTotp(secret, mfaCode)) {
      await failAttempt(email);
      return response(401, { error: 'Código MFA incorrecto.', mfaRequired: true });
    }

    mfaVerified = true;
  }

  await clearAttempts(email);
  const token = signJWT({
    sub: user.id,
    email,
    role,
    mfa: mfaVerified,
    sv: Number(user.sessionVersion || 0),
    exp: Math.floor(Date.now() / 1000) + 8 * 3600,
  });

  return response(200, {
    user: {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      phone: user.phone,
      role,
      token,
      mfa: mfaVerified,
    },
  });
};

exports._test = { verifyPassword, checkThrottle, staffMfaRequired };
