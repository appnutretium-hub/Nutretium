'use strict';

const usuarios = require('../lib/usuarios');
const { hashPassword, verifyPassword: verifyPasswordRecord } = require('../lib/passwords');
const { signJWT, secretConfigured } = require('../lib/jwt');
const { effectiveRoleFor } = require('../lib/staff');
const { secretFor, verify: verifyTotp } = require('../lib/totp');
const { cabecerasCORS } = require('../lib/cors');
const { consume, reset } = require('../lib/rate-limit');
const security=require('../lib/security-policy');

const CORS = cabecerasCORS('POST, OPTIONS');
const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const response = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { ...CORS, ...security.securityHeaders(headers) },
  body: JSON.stringify(body),
});

function verifyPassword(password, stored) { return verifyPasswordRecord(password, stored).ok; }
async function upgradeHashIfNeeded(email, password, user, verification) {
  if (!verification.needsRehash) return;
  const upgraded = hashPassword(password),at = new Date().toISOString();
  await usuarios.muta(email, current => current.passwordHash === user.passwordHash ? { ...current, passwordHash:upgraded, passwordHashUpgradedAt:at, updatedAt:at } : null).catch(() => null);
}
async function checkThrottle(event, email) {
  const gate = await consume({scope: 'staff-login',event,extra: email,limit: MAX_INTENTOS,windowMs: VENTANA_MS});
  return {ok: gate.allowed === true,retryAfter: Math.max(1, Number(gate.retryAfter) || 60),degraded: gate.degraded === true};
}
async function clearAttempts(event, email) { await reset({ scope: 'staff-login', event, extra: email }).catch(() => false); }
function staffMfaRequired(){return security.staffMfaRequired()}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  if (!secretConfigured()) return response(503, { error: 'Sesiones no disponibles.' });
  let body;try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'JSON no válido.' }); }
  const email = String(body.email || '').trim().toLowerCase(),password = String(body.password || ''),mfaCode = String(body.mfaCode || '').replace(/\s/g, '');
  const wait = await checkThrottle(event, email);
  if (!wait.ok) return response(wait.degraded ? 503 : 429,{error: wait.degraded ? 'El control de acceso del personal no está disponible. Prueba de nuevo más tarde.' : 'Demasiados intentos. Prueba más tarde.'},{ 'Retry-After': String(wait.retryAfter) });
  const user = await usuarios.lee(email),role = await effectiveRoleFor(email),verification = user ? verifyPasswordRecord(password, user.passwordHash) : { ok:false, needsRehash:false };
  if (!user || role === 'client' || !verification.ok) return response(401, { error: 'Credenciales incorrectas.' });
  const requireMfa = staffMfaRequired(),secret = await secretFor(email);let mfaVerified = false;
  if (requireMfa) {
    if (!secret) return response(503, {error: 'MFA está activado para el personal, pero esta cuenta aún no tiene TOTP configurado.',mfaSetupRequired: true});
    if (!mfaCode) return response(401, {error: 'Introduce el código de 6 dígitos de tu aplicación de autenticación.',mfaRequired: true});
    if (!verifyTotp(secret, mfaCode)) return response(401, { error: 'Código MFA incorrecto.', mfaRequired: true });
    mfaVerified = true;
  }
  await upgradeHashIfNeeded(email, password, user, verification);await clearAttempts(event, email);
  const token = signJWT({sub: user.id,email,role,kind: 'staff-login',mfa: mfaVerified,sv: Number(user.sessionVersion || 0),exp: Math.floor(Date.now() / 1000) + security.STAFF_LOGIN_TTL_SECONDS});
  return response(200, {user: {id: user.id,name: user.name,surname: user.surname,email: user.email,phone: user.phone,role,token,mfa: mfaVerified,expiresIn:security.STAFF_LOGIN_TTL_SECONDS}});
};
exports._test = { verifyPassword, upgradeHashIfNeeded, checkThrottle, staffMfaRequired };