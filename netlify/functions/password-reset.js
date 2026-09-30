'use strict';

// Compatibilidad con los clientes antiguos: ambas rutas usan ahora
// el mismo almacén, los mismos límites y el mismo consumo de tokens.
const accountSecurity = require('./account-security');
const { cabecerasCORS } = require('../lib/cors');

const CORS = cabecerasCORS('POST, OPTIONS');
const MAX_BODY_BYTES = 16 * 1024;

function response(statusCode, error) {
  return {
    statusCode,
    headers: { ...CORS, 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error }),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return accountSecurity.handler(event);
  }

  let body;

  try {
    const encoded = event.body ?? '{}';

    if (typeof encoded !== 'string') {
      return response(400, 'JSON no válido.');
    }

    if (
      Buffer.byteLength(encoded) >
      MAX_BODY_BYTES * (event.isBase64Encoded ? 2 : 1)
    ) {
      return response(413, 'Petición demasiado grande.');
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(encoded, 'base64').toString('utf8')
      : encoded;

    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      return response(413, 'Petición demasiado grande.');
    }

    body = JSON.parse(raw);
  } catch {
    return response(400, 'JSON no válido.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response(400, 'El cuerpo debe ser un objeto JSON.');
  }

  let mapped;

  if (body.action === 'request') {
    mapped = {
      action: 'request-reset',
      email: body.email,
    };
  } else if (body.action === 'reset') {
    // Conserva el mínimo de diez caracteres de este endpoint antiguo.
    if (
      typeof body.newPassword !== 'string' ||
      body.newPassword.length < 10 ||
      body.newPassword.length > 128
    ) {
      return response(
        400,
        'La contraseña debe tener entre 10 y 128 caracteres.'
      );
    }

    mapped = {
      action: 'reset-password',
      resetToken: body.token,
      newPassword: body.newPassword,
    };
  } else {
    return response(400, 'Acción no reconocida.');
  }

  const result = await accountSecurity.handler({
    ...event,
    body: JSON.stringify(mapped),
    isBase64Encoded: false,
  });

  if (mapped.action === 'reset-password' && result.statusCode === 200) {
    return {
      ...result,
      body: JSON.stringify({
        ...JSON.parse(result.body),
        reauthRequired: true,
      }),
    };
  }

  return result;
};
