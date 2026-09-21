'use strict';

const usuarios = require('../lib/usuarios');
const { hashPassword, verifyPassword: verifyPasswordRecord } = require('../lib/passwords');
const { signJWT, secretConfigured } = require('../lib/jwt');
const { effectiveRoleFor } = require('../lib/staff');
const { secretFor, verify: verifyTotp, generateSecret, sealSecret, provisioningUri } = require('../lib/totp');
const { cabecerasCORS } = require('../lib/cors');
const { consume, reset } = require('../lib/rate-limit');
const security=require('../lib/security-policy');
const defense=require('../lib/security-defense');
const mfaReplay=require('../lib/mfa-replay');

const CORS = cabecerasCORS('POST, OPTIONS');
const PASSWORD_LIMIT = 10;
const PASSWORD_WINDOW_MS = 5 * 60 * 1000;
const MFA_LIMIT = 6;
const MFA_WINDOW_MS = 2 * 60 * 1000;
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
function throttleConfig(kind){
  return kind === 'mfa'
    ? { scope:'staff-login-mfa-v2', limit:MFA_LIMIT, windowMs:MFA_WINDOW_MS }
    : { scope:'staff-login-password-v2', limit:PASSWORD_LIMIT, windowMs:PASSWORD_WINDOW_MS };
}
async function checkThrottle(event, email, kind='password') {
  const cfg=throttleConfig(kind);
  const gate = await consume({scope:cfg.scope,event,extra:email,limit:cfg.limit,windowMs:cfg.windowMs,allowDegradedFallback:true});
  return {ok: gate.allowed === true,retryAfter: Math.max(1, Number(gate.retryAfter) || 60),degraded: gate.degraded === true,fallback:gate.fallback===true};
}
async function clearAttempts(event,email,kind){
  const scopes=kind==='mfa'?['staff-login-mfa-v2']:kind==='password'?['staff-login-password-v2','staff-login']:['staff-login-password-v2','staff-login-mfa-v2','staff-login'];
  await Promise.all(scopes.map(scope=>reset({scope,event,extra:email}).catch(()=>false)));
}
function privilegedMfaExempt(){return false}
function mfaRequiredFor(role,user){return ['owner','admin'].includes(String(role||''))||security.staffMfaRequired()||user?.mfaEnabled===true}

async function ensurePendingMfaEnrollment(email,user){
  let current=user,secret=secretFor(email,current);
  if(!secret){
    const generated=generateSecret(),sealed=sealSecret(generated),now=new Date().toISOString();
    current=await usuarios.muta(email,existing=>{
      if(secretFor(email,existing))return null;
      return {...existing,mfaEnabled:true,mfaSecretEncrypted:sealed,mfaEnrollmentPendingAt:now,mfaUpdatedAt:now,updatedAt:now};
    });
    secret=secretFor(email,current);
  }
  if(!secret)return null;
  return {user:current||user,secret,pending:Boolean((current||user)?.mfaEnrollmentPendingAt)};
}
async function confirmPendingMfaEnrollment(email,user){
  if(!user?.mfaEnrollmentPendingAt)return user;
  const now=new Date().toISOString();
  const updated=await usuarios.muta(email,current=>{
    if(!current?.mfaEnrollmentPendingAt)return null;
    const next={...current,mfaEnabled:true,mfaConfiguredAt:now,mfaConfirmedAt:now,mfaUpdatedAt:now,updatedAt:now};
    delete next.mfaEnrollmentPendingAt;
    return next;
  });
  return updated||user;
}
function setupPayload(email,secret){
  return {
    error:'Configura la autenticación MFA para continuar. Añade esta clave a tu aplicación de autenticación y escribe el código de 6 dígitos.',
    mfaRequired:true,
    mfaSetupRequired:true,
    mfa:{setupSecret:secret,provisioningUri:provisioningUri(email,secret),pendingConfirmation:true},
  };
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  try { defense.assertBrowserBoundary(event); } catch (e) { return response(403, { error: e.message, code: e.code || 'REQUEST_BLOCKED' }); }
  if (!secretConfigured()) return response(503, { error: 'Sesiones no disponibles.' });
  let body;try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'JSON no válido.' }); }
  const email = String(body.email || '').trim().toLowerCase(),password = String(body.password || ''),mfaCode = String(body.mfaCode || '').replace(/\s/g, '');
  if(!email||!password)return response(400,{error:'Email y contraseña son obligatorios.'});

  const passwordGate=await checkThrottle(event,email,'password');
  if(!passwordGate.ok)return response(429,{error:`Demasiados intentos de contraseña. Prueba otra vez dentro de ${Math.max(1,Math.ceil(passwordGate.retryAfter/60))} minutos.`},{'Retry-After':String(passwordGate.retryAfter)});

  let user = await usuarios.lee(email);
  const role = await effectiveRoleFor(email);
  const verification = user ? verifyPasswordRecord(password, user.passwordHash) : { ok:false, needsRehash:false };
  if (!user || role === 'client' || !verification.ok) return response(401, { error: 'Credenciales incorrectas.' });
  await clearAttempts(event,email,'password');

  const requireMfa = mfaRequiredFor(role,user);
  let secret = secretFor(email,user),mfaVerified = false;
  if (requireMfa) {
    if(!secret){
      const enrollment=await ensurePendingMfaEnrollment(email,user);
      if(!enrollment)return response(503,{error:'No se ha podido preparar el MFA para esta cuenta.'});
      user=enrollment.user;secret=enrollment.secret;
    }
    if(user?.mfaEnrollmentPendingAt&&!mfaCode)return response(401,setupPayload(email,secret));
    if (!mfaCode) return response(401, {error: 'Introduce el código de 6 dígitos de tu aplicación de autenticación.',mfaRequired: true});

    const mfaGate=await checkThrottle(event,email,'mfa');
    if(!mfaGate.ok)return response(429,{error:'Demasiados códigos MFA incorrectos. Espera un momento antes de volver a intentarlo.',mfaRequired:true},{'Retry-After':String(mfaGate.retryAfter)});
    if (!verifyTotp(secret, mfaCode)) return response(401, { error: 'Código MFA incorrecto.', mfaRequired: true, mfaSetupRequired:Boolean(user?.mfaEnrollmentPendingAt), ...(user?.mfaEnrollmentPendingAt?{mfa:{setupSecret:secret,provisioningUri:provisioningUri(email,secret),pendingConfirmation:true}}:{}) });
    const once=await mfaReplay.consume(email,mfaCode);
    if(!once.ok)return response(once.code==='MFA_REPLAY_GUARD_UNAVAILABLE'?503:409,{error:once.error,code:once.code,mfaRequired:true});
    await clearAttempts(event,email,'mfa');
    user=await confirmPendingMfaEnrollment(email,user);
    mfaVerified = true;
  }

  await upgradeHashIfNeeded(email, password, user, verification);
  await clearAttempts(event,email);
  const binding=defense.newSessionBinding(event);
  const token = signJWT({sub: user.id,email,role,kind: 'staff-login',mfa: mfaVerified,sv: Number(user.sessionVersion || 0),fp:binding.fp,jti:binding.jti,exp: Math.floor(Date.now() / 1000) + security.STAFF_LOGIN_TTL_SECONDS});
  return response(200, {user: {id: user.id,name: user.name,surname: user.surname,email: user.email,phone: user.phone,role,token,mfa: mfaVerified,mfaRequired:requireMfa,rateLimitFallback:Boolean(passwordGate.fallback),expiresIn:security.STAFF_LOGIN_TTL_SECONDS}});
};
exports._test = { verifyPassword, upgradeHashIfNeeded, checkThrottle, clearAttempts, privilegedMfaExempt, mfaRequiredFor, ensurePendingMfaEnrollment, confirmPendingMfaEnrollment, setupPayload };
