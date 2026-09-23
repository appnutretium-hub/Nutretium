'use strict';

const usuarios = require('../lib/usuarios');
const { hashPassword, verifyPassword: verifyPasswordRecord } = require('../lib/passwords');
const { signJWT, secretConfigured } = require('../lib/jwt');
const { effectiveRoleFor } = require('../lib/staff');
const { secretFor, verify: verifyTotp, generateSecret, sealSecret, provisioningUri } = require('../lib/totp');
const { cabecerasCORS } = require('../lib/cors');
const { consume, reset } = require('../lib/rate-limit');
const { connectBlobs } = require('../lib/netlify-blobs-runtime');
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
function privilegedMfaExempt(role){return String(role||'')==='owner'}
function mfaRequiredFor(role,user){return !privilegedMfaExempt(role) && (String(role||'')==='admin'||security.staffMfaRequired()||user?.mfaEnabled===true)}
function mfaSetupBody(email,secret){
  return {
    error:'Configura MFA para continuar. Añade la clave a tu aplicación de autenticación e introduce el código de 6 dígitos.',
    mfaRequired:true,
    mfaSetupRequired:true,
    mfa:{setupSecret:secret,provisioningUri:provisioningUri(email,secret),oneTimeDisplay:false},
  };
}
async function beginMfaSelfSetup(email,user){
  const existing=secretFor(email,user);
  if(existing&&user?.mfaSelfSetupPendingAt)return{secret:existing,created:false};
  if(existing)return{secret:existing,created:false,managedElsewhere:true};
  const secret=generateSecret(),sealed=sealSecret(secret),now=new Date().toISOString();
  const updated=await usuarios.muta(email,current=>{
    const currentSecret=secretFor(email,current);
    if(currentSecret)return current;
    return {...current,mfaEnabled:true,mfaSecretEncrypted:sealed,mfaSelfSetupPendingAt:now,mfaUpdatedAt:now,updatedAt:now};
  });
  if(!updated)throw new Error('No se pudo preparar MFA para esta cuenta.');
  const effective=secretFor(email,updated);
  if(!effective)throw new Error('No se pudo preparar MFA para esta cuenta.');
  return{secret:effective,created:true,pending:Boolean(updated.mfaSelfSetupPendingAt)};
}
async function completeMfaSelfSetup(email){
  const now=new Date().toISOString();
  return usuarios.muta(email,current=>{
    if(!current.mfaSelfSetupPendingAt)return current;
    const next={...current,mfaEnabled:true,mfaConfiguredAt:current.mfaConfiguredAt||now,mfaVerifiedAt:now,mfaUpdatedAt:now,updatedAt:now};
    delete next.mfaSelfSetupPendingAt;
    return next;
  });
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  connectBlobs(event);
  try { defense.assertBrowserBoundary(event); } catch (e) { return response(403, { error: e.message, code: e.code || 'REQUEST_BLOCKED' }); }
  if (!secretConfigured()) return response(503, { error: 'Sesiones no disponibles.' });
  let body;try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'JSON no válido.' }); }
  const email = String(body.email || '').trim().toLowerCase(),password = String(body.password || ''),mfaCode = String(body.mfaCode || '').replace(/\s/g, '');
  if(!email||!password)return response(400,{error:'Email y contraseña son obligatorios.'});

  const user = await usuarios.lee(email);
  const role = await effectiveRoleFor(email);
  const verification = user ? verifyPasswordRecord(password, user.passwordHash) : { ok:false, needsRehash:false };
  if (!user || role === 'client' || !verification.ok) {
    const passwordGate=await checkThrottle(event,email,'password');
    // Al agotar los intentos se responde 429 con Retry-After, como hacen el
    // login de cliente (auth.js) y el resto de endpoints con freno. Antes esta
    // rama devolvía el mismo 401 que una contraseña incorrecta: el contador se
    // consumía, pero bloquear y fallar eran indistinguibles, así que el freno
    // del acceso interno —el más privilegiado— no frenaba nada.
    if(!passwordGate.ok){const seconds=passwordGate.retryAfter;return response(429,{error:`Demasiados intentos incorrectos. Prueba otra vez dentro de ${Math.max(1,Math.ceil(seconds/60))} minutos.`},{'Retry-After':String(seconds)})}
    return response(401, { error: 'Credenciales incorrectas.' });
  }
  await clearAttempts(event,email,'password');

  const requireMfa = mfaRequiredFor(role,user);
  let mfaVerified = false;
  if (requireMfa) {
    let secret = secretFor(email,user);
    if(!secret){
      let setup;try{setup=await beginMfaSelfSetup(email,user)}catch{return response(503,{error:'No se pudo preparar MFA para esta cuenta. Contacta con el propietario.'})}
      secret=setup.secret;
      return response(401,mfaSetupBody(email,secret));
    }
    if(user?.mfaSelfSetupPendingAt&&!mfaCode)return response(401,mfaSetupBody(email,secret));
    if (!mfaCode) return response(401, {error: 'Introduce el código de 6 dígitos de tu aplicación de autenticación.',mfaRequired: true});
    const mfaGate=await checkThrottle(event,email,'mfa');
    // Igual que arriba: bloqueado no puede parecerse a código incorrecto.
    if(!mfaGate.ok){const seconds=mfaGate.retryAfter;return response(429,{error:`Demasiados códigos incorrectos. Prueba otra vez dentro de ${Math.max(1,Math.ceil(seconds/60))} minutos.`,mfaRequired:true},{'Retry-After':String(seconds)})}
    if (!verifyTotp(secret, mfaCode)) return response(401, { error: 'Código MFA incorrecto.', mfaRequired: true });
    const once=await mfaReplay.consume(email,mfaCode);
    if(!once.ok)return response(once.code==='MFA_REPLAY_GUARD_UNAVAILABLE'?503:409,{error:once.error,code:once.code,mfaRequired:true});
    if(user?.mfaSelfSetupPendingAt){
      const completed=await completeMfaSelfSetup(email).catch(()=>null);
      if(!completed)return response(503,{error:'MFA fue verificado, pero no se pudo finalizar su configuración. Inténtalo de nuevo.'});
    }
    await clearAttempts(event,email,'mfa');
    mfaVerified = true;
  }

  await upgradeHashIfNeeded(email, password, user, verification);
  await clearAttempts(event,email);
  const binding=defense.newSessionBinding(event);
  const token = signJWT({sub: user.id,email,role,kind: 'staff-login',mfa: mfaVerified,sv: Number(user.sessionVersion || 0),fp:binding.fp,jti:binding.jti,exp: Math.floor(Date.now() / 1000) + security.STAFF_LOGIN_TTL_SECONDS});
  return response(200, {user: {id: user.id,name: user.name,surname: user.surname,email: user.email,phone: user.phone,role,token,mfa: mfaVerified,mfaRequired:requireMfa,expiresIn:security.STAFF_LOGIN_TTL_SECONDS}});
};
exports._test = { verifyPassword, upgradeHashIfNeeded, checkThrottle, clearAttempts, privilegedMfaExempt, mfaRequiredFor, mfaSetupBody, beginMfaSelfSetup, completeMfaSelfSetup };
