/**
 * netlify/lib/jwt.js — NUTRETIUM
 *
 * Firma y verificación de JWT (HS256) sin dependencias externas.
 * Centralizado para que login (auth.js) y las funciones que consumen el token
 * usen exactamente el mismo secreto y algoritmo.
 */

'use strict';

const crypto = require('crypto');

/**
 * Secreto de firma.
 *
 * TODO(seguridad): definir JWT_SECRET en Netlify → Site configuration →
 * Environment variables (cadena larga y aleatoria, marcada como secreta) y
 * redesplegar. Mientras no exista, se usa el valor por defecto que está
 * escrito aquí abajo, en el repositorio: cualquiera que lo lea puede
 * falsificar sesiones de usuario. Al cambiarlo, las sesiones abiertas se
 * invalidan y los usuarios tendrán que volver a iniciar sesión (una vez).
 */
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('[jwt] TODO: falta JWT_SECRET en el entorno; usando el secreto por defecto (INSEGURO).');
    return 'nutretium-dev-secret-change-in-production';
  }
  return secret;
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJWT(payload, secret = getSecret()) {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = base64url(Buffer.from(JSON.stringify(payload)));
  const sig    = base64url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

/**
 * Verifica firma Y caducidad. Lanza si el token no es válido.
 * @returns {object} claims
 */
function verifyJWT(token, secret = getSecret()) {
  const [header, body, sig] = String(token || '').split('.');
  if (!header || !body || !sig) throw new Error('Token malformado');

  const expected = base64url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Firma inválida');

  const claims = JSON.parse(Buffer.from(body, 'base64').toString());
  if (claims.exp && Math.floor(Date.now() / 1000) > claims.exp) throw new Error('Token expirado');

  return claims;
}

/** Extrae el token de una cabecera "Authorization: Bearer xxx". */
function tokenFromHeader(headers = {}) {
  const raw = headers.authorization || headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : null;
}

module.exports = { signJWT, verifyJWT, getSecret, tokenFromHeader };
