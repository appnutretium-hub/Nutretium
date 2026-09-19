'use strict';

const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');
const usuarios = require('./usuarios');

async function verifyUserToken(token) {
  if (!secretConfigured()) throw new Error('Sesiones no configuradas');
  const claims = verifyJWT(token);
  const email = String(claims.email || '').toLowerCase();
  if (!email) throw new Error('Token sin usuario');
  const user = await usuarios.lee(email);
  if (!user) throw new Error('Usuario no encontrado');
  const validAfter = Number(user.tokensValidAfter || 0);
  const issuedAt = Number(claims.iat || 0);
  if (validAfter && (!issuedAt || issuedAt < validAfter)) throw new Error('Sesión revocada');
  return { claims, user, email };
}

async function verifyEventSession(event) {
  const token = tokenFromHeader(event.headers || {});
  if (!token) throw new Error('Token ausente');
  return verifyUserToken(token);
}

module.exports = { verifyUserToken, verifyEventSession };
