'use strict';

process.env.NUTRETIUM_TEST_MEMORY_BLOBS = 'true';
process.env.JWT_SECRET = 'staff-mfa-test-secret-abcdefghijklmnopqrstuvwxyz-123456';
process.env.ADMIN_EMAILS = 'owner@nutretium.test';
process.env.STAFF_ROLES_JSON = '{}';

const assert = require('assert');
const crypto = require('crypto');
const usuarios = require('../netlify/lib/usuarios');
const { code: totpCode } = require('../netlify/lib/totp');
const staffLogin = require('../netlify/functions/staff-login');

const email = 'owner@nutretium.test';
const password = 'Nutretium-Test-Password-2026';
const secret = 'JBSWY3DPEHPK3PXP';

function passwordHash(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(value, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function event(body) {
  return {
    httpMethod: 'POST',
    headers: { 'x-nf-client-connection-ip': '127.0.0.91' },
    body: JSON.stringify(body),
  };
}

function parse(response) {
  return JSON.parse(response.body || '{}');
}

(async () => {
  await usuarios.escribe(email, {
    id: 'owner-mfa-test',
    name: 'Owner',
    surname: 'Nutretium',
    email,
    phone: '',
    passwordHash: passwordHash(password),
    sessionVersion: 0,
  });

  // A secret may exist in configuration without enabling the MFA policy.
  // This must not lock the administrator out.
  process.env.REQUIRE_STAFF_MFA = 'false';
  process.env.STAFF_TOTP_SECRETS = JSON.stringify({ [email]: secret });
  let response = await staffLogin.handler(event({ email, password }));
  assert.strictEqual(response.statusCode, 200, 'MFA disabled: password login must succeed');
  assert.strictEqual(parse(response).user.role, 'admin');
  assert.strictEqual(parse(response).user.mfa, false, 'MFA claim must mean verified, not merely configured');

  // When policy is enabled, the server first requests the second factor.
  process.env.REQUIRE_STAFF_MFA = 'true';
  response = await staffLogin.handler(event({ email, password }));
  assert.strictEqual(response.statusCode, 401, 'MFA enabled: blank second factor must not log in');
  assert.strictEqual(parse(response).mfaRequired, true);

  // A valid current TOTP completes the login.
  response = await staffLogin.handler(event({ email, password, mfaCode: totpCode(secret) }));
  assert.strictEqual(response.statusCode, 200, 'Valid TOTP must complete login');
  assert.strictEqual(parse(response).user.mfa, true);

  // A wrong TOTP is rejected.
  response = await staffLogin.handler(event({ email, password, mfaCode: '000000' }));
  assert.strictEqual(response.statusCode, 401, 'Wrong TOTP must be rejected');
  assert.strictEqual(parse(response).mfaRequired, true);

  // Enabling the policy before provisioning a secret must fail closed with an
  // explicit setup error, rather than presenting an impossible MFA challenge.
  process.env.STAFF_TOTP_SECRETS = '{}';
  response = await staffLogin.handler(event({ email, password }));
  assert.strictEqual(response.statusCode, 503, 'MFA policy without a secret must fail closed');
  assert.strictEqual(parse(response).mfaSetupRequired, true);

  console.log('[test-staff-login-mfa] OK · optional MFA · challenge · valid/invalid TOTP · missing setup');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
