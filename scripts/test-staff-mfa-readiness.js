'use strict';
const assert=require('assert');
const totp=require('../netlify/lib/totp');
const readiness=require('../netlify/lib/staff-mfa-readiness')._test;

const valid='JBSWY3DPEHPK3PXP';
assert.strictEqual(readiness.validSecret(valid),true,'un secreto base32 válido debe aceptarse');
assert.strictEqual(readiness.validSecret('not-a-totp-secret'),false,'un valor arbitrario no debe aceptarse como TOTP');

const legacyEnv={STAFF_TOTP_SECRETS:JSON.stringify({'manager@nutretium.com':valid})};
assert.strictEqual(readiness.envSecretFor('MANAGER@nutretium.com',legacyEnv),valid,'el mapa legacy JSON debe seguir siendo compatible');
assert.strictEqual(readiness.envSecretFor('manager@nutretium.com',{STAFF_TOTP_SECRETS:'manager@nutretium.com:'+valid}),'','el formato legacy no JSON no debe producir un falso verde');

const targets=readiness.requiredStaffEmails({
 ADMIN_EMAILS:'admin@nutretium.com, appnutretium@gmail.com',
 MANAGER_EMAILS:'manager@nutretium.com',
 STAFF_ROLES_JSON:JSON.stringify({'custom@nutretium.com':['orders.read']})
},[{email:'operator@nutretium.com',role:'operator',active:true},{email:'disabled@nutretium.com',role:'support',active:false}]);
assert.deepStrictEqual(targets,['admin@nutretium.com','custom@nutretium.com','manager@nutretium.com','operator@nutretium.com'],'el propietario exento y el personal inactivo no deben bloquear readiness');

const previousKey=process.env.MFA_ENCRYPTION_KEY;
process.env.MFA_ENCRYPTION_KEY='test-readiness-master-key';
try{
 const user={mfaSecretEncrypted:totp.sealSecret(valid)};
 assert.strictEqual(readiness.configuredSecret('manager@nutretium.com',user,{}),true,'un secreto MFA cifrado por usuario debe contar como configuración efectiva');
 assert.strictEqual(readiness.configuredSecret('manager@nutretium.com',null,legacyEnv),true,'el mapa JSON legacy válido debe seguir contando');
 assert.strictEqual(readiness.configuredSecret('manager@nutretium.com',null,{STAFF_TOTP_SECRETS:'garbage'}),false,'una variable malformada no debe contar como MFA');
}finally{
 if(previousKey===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=previousKey;
}

console.log('[test-staff-mfa-readiness] OK · MFA cifrado por usuario · JSON legacy válido · formatos inválidos fail-closed');
