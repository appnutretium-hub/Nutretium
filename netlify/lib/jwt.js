/**
 * netlify/lib/jwt.js — NUTRETIUM
 *
 * Firma y verificación de JWT (HS256) sin dependencias externas.
 * Centralizado para que login (auth.js) y las funciones que consumen el token
 * usen exactamente el mismo secreto y algoritmo.
 */

'use strict';

const crypto = require('crypto');

/** Longitud mínima razonable para un secreto HS256. */
const MIN_SECRETO = 32;

/**
 * ¿Está el secreto bien configurado? Los handlers lo consultan para responder
 * un 503 claro en vez de reventar con un 500 genérico.
 */
function secretConfigured() {
  const s = process.env.JWT_SECRET;
  return typeof s === 'string' && s.length >= MIN_SECRETO;
}

/**
 * Secreto de firma. Sin JWT_SECRET NO se firma nada.
 *
 * Antes había aquí un valor por defecto escrito en el repositorio: cualquiera
 * que leyese el código podía firmarse un token y hacerse pasar por otro usuario.
 * Ahora falla cerrado — es preferible que el login no funcione a que funcione
 * con un secreto público.
 *
 * Configúralo en Netlify → Site configuration → Environment variables, con una
 * cadena larga y aleatoria marcada como secreta:  openssl rand -base64 48
 */
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está configurado: las sesiones están deshabilitadas.');
  }
  if (secret.length < MIN_SECRETO) {
    throw new Error(`JWT_SECRET es demasiado corto (mínimo ${MIN_SECRETO} caracteres).`);
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

module.exports = { signJWT, verifyJWT, getSecret, secretConfigured, tokenFromHeader };
