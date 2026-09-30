'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { signJWT, secretConfigured } = require('../lib/jwt');
const session = require('../lib/session');
const staff = require('../lib/staff');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const usuarios = require('../lib/usuarios');
const direccion = require('../lib/direccion');
const { consume, reset } = require('../lib/rate-limit');
const { connectBlobs } = require('../lib/netlify-blobs-runtime');
const { getBlobStore } = require('../lib/blob-store');

const CORS = cabecerasCORS('POST, OPTIONS');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 16 * 1024;
const VENTANA_MS = 15 * 60 * 1000;

function response(statusCode, payload, headers = {}) {
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

function revisaFicha({ name, surname, phone }) {
  if (!name) return 'El nombre es obligatorio.';

  if (name.length > 60 || surname.length > 60) {
    return 'El nombre y los apellidos no pueden pasar de 60 caracteres.';
  }

  if (phone.length > 20 || !/^[0-9 +().-]*$/.test(phone)) {
    return 'El teléfono no es válido.';
  }

  if ([name, surname, phone].some(value => /[<>]/.test(value))) {
    return 'Los datos personales no pueden llevar «<» ni «>».';
  }

  return null;
}

function fichaPublica(user, extra) {
  return {
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    phone: user.phone,
    direccion: direccion.normaliza(user.direccion),
    direccionCompleta: direccion.completa(user.direccion),
    role: staff.roleFor(user.email),
    ...extra,
  };
}

function version(user) {
  const value = Number(user.sessionVersion ?? 0);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Versión de sesión no válida.');
  }

  return value;
}

function sameCredentials(a, b) {
  return Boolean(
    a &&
    b &&
    a.id === b.id &&
    a.passwordHash === b.passwordHash &&
    version(a) === version(b) &&
    a.tokensValidAfter === b.tokensValidAfter
  );
}

function customerToken(user, email) {
  return signJWT({
    sub: user.id,
    email,
    kind: 'customer',
    sv: version(user),
    exp: Math.floor(Date.now() / 1000) + session.CUSTOMER_SESSION_TTL_SECONDS,
  });
}

function authenticatedResponse(statusCode, user, email) {
  const token = customerToken(user, email);

  // Conserva el token de compatibilidad que todavía consumen los formularios.
  return response(
    statusCode,
    {
      user: fichaPublica(user, { token }),
      sessionTransport: 'cookie',
      legacyToken: true,
    },
    {
      'Set-Cookie': session.customerSessionCookie(token),
    }
  );
}

function profileResponse(user, verified) {
  const headers = {};

  if (verified.source !== 'cookie') {
    headers['Set-Cookie'] = session.customerSessionCookie(
      customerToken(user, verified.email)
    );
  }

  return response(
    200,
    {
      user: fichaPublica(user),
      sessionTransport:
        verified.source === 'cookie' ? 'cookie' : 'cookie-upgraded',
    },
    headers
  );
}

async function upgradeHashIfNeeded(email, password, user, verification) {
  if (!verification.needsRehash) return user;

  const upgraded = hashPassword(password);

  return usuarios.muta(email, current => {
    if (!sameCredentials(current, user)) return null;

    const at = new Date().toISOString();

    return {
      ...current,
      passwordHash: upgraded,
      passwordHashUpgradedAt: at,
      updatedAt: at,
    };
  });
}

function rateResponse(gate) {
  return response(
    gate.degraded ? 503 : 429,
    {
      error: gate.degraded
        ? 'El control de seguridad no está disponible temporalmente.'
        : 'Demasiados intentos. Espera unos minutos.',
    },
    {
      'Retry-After': String(Math.max(1, Number(gate.retryAfter) || 60)),
    }
  );
}

function requireUsers() {
  const store = getBlobStore('users');

  if (
    !store ||
    typeof store.getWithMetadata !== 'function' ||
    typeof store.setJSON !== 'function'
  ) {
    throw new Error('Almacenamiento de usuarios no disponible.');
  }
}

function profileInput(body) {
  if (
    typeof body.name !== 'string' ||
    (body.surname !== undefined && typeof body.surname !== 'string') ||
    (body.phone !== undefined && typeof body.phone !== 'string')
  ) {
    return null;
  }

  return {
    name: body.name.trim(),
    surname: (body.surname || '').trim(),
    phone: (body.phone || '').trim(),
  };
}

function validAddressInput(value) {
  return value === undefined || Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    direccion.CAMPOS.every(
      key => value[key] === undefined || typeof value[key] === 'string'
    )
  );
}

async function handle(event, body) {
  if (body.action === 'logout') {
    return response(
      200,
      { ok: true },
      { 'Set-Cookie': session.clearCustomerSessionCookie() }
    );
  }

  if (!secretConfigured()) {
    return response(503, {
      error: 'El registro y el inicio de sesión no están disponibles ahora mismo.',
    });
  }

  requireUsers();

  if (body.action === 'register' || body.action === 'login') {
    if (
      typeof body.email !== 'string' ||
      typeof body.password !== 'string'
    ) {
      return response(400, {
        error: 'Email y contraseña deben ser texto.',
      });
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;

    // Permite iniciar sesión con contraseñas antiguas de más de 128 caracteres.
    const maximum = body.action === 'register' ? 128 : 1024;

    if (
      !email ||
      email.length > 254 ||
      !EMAIL.test(email) ||
      !password ||
      password.length > maximum
    ) {
      return response(400, {
        error: 'Email o contraseña no válidos.',
      });
    }

    if (body.action === 'register') {
      if (password.length < 8) {
        return response(400, {
          error: 'La contraseña debe tener entre 8 y 128 caracteres.',
        });
      }

      const ficha = profileInput(body);

      if (!ficha) {
        return response(400, {
          error: 'Los datos personales deben ser texto.',
        });
      }

      const problem = revisaFicha(ficha);

      if (problem) return response(400, { error: problem });

      if (!validAddressInput(body.direccion)) {
        return response(400, { error: 'Dirección no válida.' });
      }

      const dir = direccion.normaliza(body.direccion);
      const dirProblem = direccion.revisa(dir);

      if (dirProblem) return response(400, { error: dirProblem });

      const gate = await consume({
        scope: 'register',
        event,
        limit: 5,
        windowMs: VENTANA_MS,
      });

      if (!gate.allowed) return rateResponse(gate);

      const user = {
        id: crypto.randomUUID(),
        ...ficha,
        email,
        direccion: dir,
        passwordHash: hashPassword(password),
        sessionVersion: 0,
        createdAt: new Date().toISOString(),
      };

      if (!await usuarios.crea(email, user)) {
        return response(409, {
          error: 'Ya existe una cuenta con ese email.',
        });
      }

      return authenticatedResponse(201, user, email);
    }

    // Comprobar límites ANTES del hash, también para el propietario.
    const ipGate = await consume({
      scope: 'login-ip',
      event,
      limit: 30,
      windowMs: VENTANA_MS,
    });

    if (!ipGate.allowed) return rateResponse(ipGate);

    const gate = await consume({
      scope: 'login',
      event,
      extra: email,
      limit: 5,
      windowMs: VENTANA_MS,
    });

    if (!gate.allowed) return rateResponse(gate);

    const user = await usuarios.lee(email);

    const verification = user
      ? verifyPassword(password, user.passwordHash)
      : { ok: false };

    if (!verification.ok) {
      return response(401, {
        error: 'Email o contraseña incorrectos.',
      });
    }

    const upgraded = await upgradeHashIfNeeded(
      email,
      password,
      user,
      verification
    );

    // Una modificación concurrente no puede convertir una contraseña antigua
    // en una sesión firmada con la nueva versión de la cuenta.
    if (
      !upgraded ||
      version(upgraded) !== version(user) ||
      upgraded.id !== user.id ||
      upgraded.tokensValidAfter !== user.tokensValidAfter ||
      !verifyPassword(password, upgraded.passwordHash).ok
    ) {
      return response(409, {
        error: 'La cuenta cambió durante el acceso. Vuelve a iniciar sesión.',
      });
    }

    const current = await usuarios.lee(email);

    if (!sameCredentials(current, upgraded)) {
      return response(409, {
        error: 'La cuenta cambió durante el acceso. Vuelve a iniciar sesión.',
      });
    }

    await reset({
      scope: 'login',
      event,
      extra: email,
    }).catch(() => false);

    // No borra contadores de acceso del personal ni el límite global por IP.
    return authenticatedResponse(200, current, email);
  }

  if (body.action === 'profile' || body.action === 'update') {
    if (body.token !== undefined && typeof body.token !== 'string') {
      return response(400, { error: 'Token no válido.' });
    }

    let verified;

    try {
      verified = await session.verifyCustomerEventSession(event, {
        legacyToken: body.token,
        requireUser: true,
      });
    } catch {
      return response(401, {
        error: 'Sesión inválida, revocada o expirada.',
      });
    }

    if (body.action === 'profile') {
      return profileResponse(verified.user, verified);
    }

    const ficha = profileInput(body);

    if (!ficha) {
      return response(400, {
        error: 'Los datos personales deben ser texto.',
      });
    }

    const problem = revisaFicha(ficha);

    if (problem) return response(400, { error: problem });

    if (!validAddressInput(body.direccion)) {
      return response(400, { error: 'Dirección no válida.' });
    }

    const requestedDir = body.direccion === undefined
      ? null
      : direccion.normaliza(body.direccion);

    if (requestedDir) {
      const problemDir = direccion.revisa(requestedDir);

      if (problemDir) return response(400, { error: problemDir });
    }

    let updated;

    try {
      updated = await usuarios.muta(verified.email, current => {
        if (!sameCredentials(current, verified.user)) {
          throw new Error('Sesión modificada durante la operación.');
        }

        return {
          ...current,
          ...ficha,
          direccion: requestedDir || direccion.normaliza(current.direccion),
          updatedAt: new Date().toISOString(),
        };
      });
    } catch {
      return response(409, {
        error: 'La cuenta cambió durante la operación. Vuelve a intentarlo.',
      });
    }

    if (!updated) {
      return response(404, { error: 'Usuario no encontrado.' });
    }

    return profileResponse(updated, verified);
  }

  return response(400, { error: 'Acción no reconocida.' });
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return response(
      405,
      { error: 'Método no permitido.' },
      { Allow: 'POST, OPTIONS' }
    );
  }

  let body;

  try {
    const encoded = event.body ?? '{}';

    if (typeof encoded !== 'string') {
      return response(400, { error: 'JSON no válido.' });
    }

    if (
      Buffer.byteLength(encoded) >
      MAX_BODY_BYTES * (event.isBase64Encoded ? 2 : 1)
    ) {
      return response(413, { error: 'Petición demasiado grande.' });
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(encoded, 'base64').toString('utf8')
      : encoded;

    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      return response(413, { error: 'Petición demasiado grande.' });
    }

    body = JSON.parse(raw);
  } catch {
    return response(400, { error: 'JSON no válido.' });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body.action !== 'string'
  ) {
    return response(400, {
      error: 'El cuerpo debe ser un objeto JSON con una acción.',
    });
  }

  try {
    connectBlobs(event);
    return await handle(event, body);
  } catch {
    console.error('[auth] No se pudo completar la operación.');

    return response(503, {
      error: 'Servicio no disponible temporalmente. Vuelve a intentarlo más tarde.',
    });
  }
};

exports._test = {
  upgradeHashIfNeeded,
  customerToken,
  authenticatedResponse,
  profileResponse,
};
