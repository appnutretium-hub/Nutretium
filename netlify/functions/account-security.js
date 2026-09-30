'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');
const { verifyEventSession } = require('../lib/session');
const {
  hashPassword,
  verifyPassword: verifyPasswordRecord,
} = require('../lib/passwords');
const usuarios = require('../lib/usuarios');
const { sendEmail } = require('../lib/email');
const { consume } = require('../lib/rate-limit');

const CORS = cabecerasCORS('POST, OPTIONS');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const RESET_TTL = 30 * 60 * 1000;
const VERIFY_TTL = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

const RESET_MESSAGE =
  'Si existe una cuenta con ese email, recibirás instrucciones.';

const INVALID_LINK =
  'Este enlace no es válido, ya se ha utilizado o ha caducado. Solicita uno nuevo.';

class InvalidTokenError extends Error {}

function json(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

function resetResponse() {
  return json(200, {
    ok: true,
    message: RESET_MESSAGE,
  });
}

function validPassword(value) {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128
  );
}

function validEmail(value) {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    EMAIL.test(value)
  );
}

function tokenHash(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

// Solo configuración del servidor: nunca Host ni X-Forwarded-Host.
function publicOrigin() {
  const origin = new URL(
    process.env.NUTRETIUM_PUBLIC_ORIGIN || 'https://nutretium.com'
  );

  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      'NUTRETIUM_PUBLIC_ORIGIN debe ser un origen HTTPS sin ruta.'
    );
  }

  return origin.origin;
}

function tokenLink(parameter, raw) {
  const url = new URL('/mi-nutretium', publicOrigin());
  url.searchParams.set(parameter, raw);
  return url.href;
}

function requireStore(name) {
  const store = getBlobStore(name);

  if (
    !store ||
    typeof store.getWithMetadata !== 'function' ||
    typeof store.setJSON !== 'function'
  ) {
    throw new Error('Almacenamiento condicional no disponible.');
  }

  return store;
}

function sessionVersion(user) {
  const version = Number(user.sessionVersion ?? 0);

  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Versión de sesión no válida.');
  }

  return version;
}

// Vincula el enlace al estado de credenciales con el que se emitió.
// Incluye el hash para detectar cambios hechos desde otros endpoints.
function credentialVersion(user) {
  if (
    !user ||
    typeof user.passwordHash !== 'string' ||
    !user.passwordHash
  ) {
    throw new Error('Credenciales no disponibles.');
  }

  return tokenHash(
    JSON.stringify([
      user.passwordHash,
      sessionVersion(user),
      user.passwordChangedAt || null,
      user.createdAt || null,
    ])
  );
}

function revokedPatch(user, passwordHash) {
  const now = Date.now();

  return {
    ...user,
    passwordHash,
    tokensValidAfter: Math.floor(now / 1000),
    sessionVersion: sessionVersion(user) + 1,
    passwordChangedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

async function authEmail(event) {
  try {
    return (await verifyEventSession(event)).email;
  } catch {
    return null;
  }
}

function rateResponse(rate) {
  return json(
    429,
    {
      error: 'Demasiados intentos. Espera unos minutos.',
    },
    {
      'Retry-After': String(rate.retryAfter || 60),
    }
  );
}

async function issueToken(store, email, user, purpose, ttl) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(raw);

  const record = {
    schemaVersion: 2,
    purpose,
    email,
    hash,
    credentialVersion: credentialVersion(user),
    expiresAt: Date.now() + ttl,
    used: false,
    createdAt: new Date().toISOString(),
  };

  const write = await store.setJSON(hash, record, {
    onlyIfNew: true,
  });

  if (write?.modified !== true) {
    throw new Error('No se pudo guardar el enlace.');
  }

  return { raw, hash };
}

// Consumo definitivo ANTES del efecto sobre la cuenta.
// No se libera el token por tiempo ni se revierte su consumo.
// Ante un fallo posterior se solicita un enlace nuevo.
async function consumeToken(store, raw, purpose) {
  const key = tokenHash(raw);

  for (let attempt = 0; attempt < 10; attempt++) {
    const entry = await store.getWithMetadata(key, {
      type: 'json',
      consistency: 'strong',
    });

    const record = entry?.data;

    if (
      !record ||
      record.schemaVersion !== 2 ||
      record.purpose !== purpose ||
      record.hash !== key ||
      record.used !== false ||
      !validEmail(record.email) ||
      typeof record.credentialVersion !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.credentialVersion) ||
      !Number.isFinite(record.expiresAt) ||
      Date.now() >= record.expiresAt
    ) {
      return null;
    }

    if (!entry.etag) {
      throw new Error('El almacenamiento no devolvió un ETag.');
    }

    const consumptionId = crypto.randomUUID();

    const write = await store.setJSON(
      key,
      {
        ...record,
        used: true,
        usedAt: new Date().toISOString(),
        consumptionId,
      },
      {
        onlyIfMatch: entry.etag,
      }
    );

    if (write?.modified === true) {
      // Confirma persistencia antes de modificar credenciales.
      const confirmed = await store.getWithMetadata(key, {
        type: 'json',
        consistency: 'strong',
      });

      if (
        confirmed?.data?.used !== true ||
        confirmed.data.consumptionId !== consumptionId
      ) {
        throw new Error(
          'No se pudo confirmar el consumo del enlace.'
        );
      }

      return record;
    }

    if (write?.modified !== false) {
      throw new Error('Respuesta de almacenamiento no válida.');
    }
  }

  throw new Error('Conflicto al consumir el enlace.');
}

function assertTokenMatchesUser(record, user) {
  if (
    Date.now() >= record.expiresAt ||
    credentialVersion(user) !== record.credentialVersion
  ) {
    throw new InvalidTokenError(INVALID_LINK);
  }
}

async function handle(event, body) {
  if (body.action === 'change-password') {
    const email = await authEmail(event);

    if (!email) {
      return json(401, {
        error: 'Debes iniciar sesión.',
      });
    }

    if (
      !validPassword(body.newPassword) ||
      typeof body.currentPassword !== 'string' ||
      body.currentPassword.length > 128
    ) {
      return json(400, {
        error:
          'Introduce la contraseña actual y una nueva de entre 8 y 128 caracteres.',
      });
    }

    const rate = await consume({
      scope: 'password-change',
      event,
      extra: email,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rate.allowed) {
      return rateResponse(rate);
    }

    requireStore('users');

    const snapshot = await usuarios.lee(email);

    if (
      !snapshot ||
      !(
        await verifyPasswordRecord(
          body.currentPassword,
          snapshot.passwordHash
        )
      ).ok
    ) {
      return json(401, {
        error: 'La contraseña actual no es correcta.',
      });
    }

    const expectedVersion = credentialVersion(snapshot);
    const newHash = await hashPassword(body.newPassword);

    const updated = await usuarios.muta(email, user => {
      if (credentialVersion(user) !== expectedVersion) {
        return null;
      }

      return revokedPatch(user, newHash);
    });

    // muta devuelve el usuario actual si el updater devuelve null.
    if (!updated || updated.passwordHash !== newHash) {
      return json(409, {
        error:
          'La cuenta cambió durante la operación. Vuelve a intentarlo.',
      });
    }

    return json(200, {
      ok: true,
      reauthRequired: true,
      message:
        'Contraseña actualizada. Por seguridad, vuelve a iniciar sesión.',
    });
  }

  if (body.action === 'request-reset') {
    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';

    if (!validEmail(email)) {
      return resetResponse();
    }

    const rate = await consume({
      scope: 'password-reset-request',
      event,
      extra: email,
      limit: 3,
      windowMs: 30 * 60 * 1000,
    });

    if (!rate.allowed) {
      return resetResponse();
    }

    requireStore('users');

    const user = await usuarios.lee(email);

    if (!user) {
      return resetResponse();
    }

    const store = requireStore('password-resets');

    const { raw, hash } = await issueToken(
      store,
      email,
      user,
      'reset-password',
      RESET_TTL
    );

    const link = tokenLink('reset', raw);

    const sent = await sendEmail({
      to: email,
      subject: 'Recupera tu contraseña · Nutretium',
      html: `<p>Has solicitado cambiar la contraseña de tu cuenta Nutretium.</p><p><a href="${link}">Crear una nueva contraseña</a></p><p>El enlace caduca en 30 minutos y solo puede utilizarse una vez.</p>`,
      idempotencyKey: `nutretium-reset/${hash.slice(0, 24)}`,
    });

    if (!sent?.ok) {
      console.error(
        '[account-security] No se pudo enviar el correo de recuperación.'
      );
    }

    return resetResponse();
  }

  if (body.action === 'reset-password') {
    if (
      typeof body.resetToken !== 'string' ||
      !TOKEN.test(body.resetToken) ||
      !validPassword(body.newPassword)
    ) {
      return json(400, {
        error: 'Enlace o contraseña no válidos.',
      });
    }

    const rate = await consume({
      scope: 'password-reset-use',
      event,
      limit: 8,
      windowMs: 30 * 60 * 1000,
    });

    if (!rate.allowed) {
      return rateResponse(rate);
    }

    requireStore('users');

    const record = await consumeToken(
      requireStore('password-resets'),
      body.resetToken,
      'reset-password'
    );

    if (!record) {
      return json(400, {
        error: INVALID_LINK,
      });
    }

    const newHash = await hashPassword(body.newPassword);

    const updated = await usuarios.muta(record.email, user => {
      assertTokenMatchesUser(record, user);
      return revokedPatch(user, newHash);
    });

    if (!updated || updated.passwordHash !== newHash) {
      return json(400, {
        error: INVALID_LINK,
      });
    }

    return json(200, {
      ok: true,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
    });
  }

  if (body.action === 'verification-status') {
    const email = await authEmail(event);

    if (!email) {
      return json(401, {
        error: 'Debes iniciar sesión.',
      });
    }

    const user = await usuarios.lee(email);

    if (!user) {
      return json(404, {
        error: 'Cuenta no encontrada.',
      });
    }

    return json(200, {
      verified: Boolean(user.emailVerifiedAt),
      verifiedAt: user.emailVerifiedAt || null,
    });
  }

  if (body.action === 'request-verification') {
    const email = await authEmail(event);

    if (!email) {
      return json(401, {
        error: 'Debes iniciar sesión.',
      });
    }

    requireStore('users');

    const user = await usuarios.lee(email);

    if (!user) {
      return json(404, {
        error: 'Cuenta no encontrada.',
      });
    }

    if (user.emailVerifiedAt) {
      return json(200, {
        ok: true,
        verified: true,
        message: 'Tu email ya está verificado.',
      });
    }

    const rate = await consume({
      scope: 'email-verify-request',
      event,
      extra: email,
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });

    if (!rate.allowed) {
      return rateResponse(rate);
    }

    const { raw, hash } = await issueToken(
      requireStore('email-verifications'),
      email,
      user,
      'verify-email',
      VERIFY_TTL
    );

    const link = tokenLink('verify', raw);

    const sent = await sendEmail({
      to: email,
      subject: 'Verifica tu email · Nutretium',
      html: `<p>Confirma que este email pertenece a tu cuenta Nutretium.</p><p><a href="${link}">Verificar email</a></p><p>El enlace caduca en 24 horas y solo puede utilizarse una vez.</p>`,
      idempotencyKey: `nutretium-verify/${hash.slice(0, 24)}`,
    });

    if (!sent?.ok) {
      return json(503, {
        error:
          'No se pudo enviar el correo. Vuelve a solicitarlo más tarde.',
      });
    }

    return json(200, {
      ok: true,
      message: 'Te hemos enviado un enlace de verificación.',
    });
  }

  if (body.action === 'verify-email') {
    if (
      typeof body.verifyToken !== 'string' ||
      !TOKEN.test(body.verifyToken)
    ) {
      return json(400, {
        error: 'Enlace de verificación no válido.',
      });
    }

    const rate = await consume({
      scope: 'email-verify-use',
      event,
      limit: 8,
      windowMs: 30 * 60 * 1000,
    });

    if (!rate.allowed) {
      return rateResponse(rate);
    }

    requireStore('users');

    const record = await consumeToken(
      requireStore('email-verifications'),
      body.verifyToken,
      'verify-email'
    );

    if (!record) {
      return json(400, {
        error: INVALID_LINK,
      });
    }

    const updated = await usuarios.muta(record.email, user => {
      assertTokenMatchesUser(record, user);

      return {
        ...user,
        emailVerifiedAt:
          user.emailVerifiedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    if (!updated?.emailVerifiedAt) {
      return json(400, {
        error: INVALID_LINK,
      });
    }

    return json(200, {
      ok: true,
      message: 'Email verificado correctamente.',
    });
  }

  return json(400, {
    error: 'Acción no reconocida.',
  });
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(
      405,
      {
        error: 'Método no permitido.',
      },
      {
        Allow: 'POST, OPTIONS',
      }
    );
  }

  let body;

  try {
    const encoded = event.body ?? '{}';

    if (typeof encoded !== 'string') {
      return json(400, {
        error: 'JSON no válido.',
      });
    }

    if (
      Buffer.byteLength(encoded, 'utf8') >
      MAX_BODY_BYTES * (event.isBase64Encoded ? 2 : 1)
    ) {
      return json(413, {
        error: 'Petición demasiado grande.',
      });
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(encoded, 'base64').toString('utf8')
      : encoded;

    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return json(413, {
        error: 'Petición demasiado grande.',
      });
    }

    body = JSON.parse(raw);
  } catch {
    return json(400, {
      error: 'JSON no válido.',
    });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body.action !== 'string'
  ) {
    return json(400, {
      error: 'El cuerpo debe ser un objeto JSON con una acción.',
    });
  }

  try {
    return await handle(event, body);
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      return json(400, {
        error: INVALID_LINK,
      });
    }

    // No registrar cuerpos, contraseñas, tokens ni excepciones
    // del proveedor que puedan contener datos sensibles.
    console.error(
      '[account-security] No se pudo completar la operación.'
    );

    if (body.action === 'request-reset') {
      return resetResponse();
    }

    const tokenOperation =
      body.action === 'reset-password' ||
      body.action === 'verify-email';

    return json(503, {
      error: tokenOperation
        ? 'No se pudo confirmar la operación. El enlace puede haber quedado consumido; solicita uno nuevo si lo necesitas.'
        : 'Servicio no disponible temporalmente. Vuelve a intentarlo más tarde.',
    });
  }
};
