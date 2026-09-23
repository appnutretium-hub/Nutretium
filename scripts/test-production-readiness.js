'use strict';
require('./test-env');
const assert=require('assert');
const sentinel=require('../netlify/functions/production-sentinel')._test;
const totp=require('../netlify/lib/totp');
const mfaReadiness=require('../netlify/lib/staff-mfa-readiness')._test;

const validTotp='JBSWY3DPEHPK3PXP';
const base={
 JWT_SECRET:'x',
 ADMIN_EMAILS:'owner-private@nutretium.com',
 CONTACT_EMAIL:'contacto@nutretium.com',
 ORDER_NOTIFICATION_EMAIL:'pedidos@nutretium.com',
 REQUIRE_STAFF_MFA:'true',
 STAFF_TOTP_SECRETS:JSON.stringify({'owner-private@nutretium.com':validTotp}),
 GITHUB_TOKEN:'x',
 REDSYS_SECRET_KEY:'x',
 REDSYS_MERCHANT_CODE:'x',
 REDSYS_ENV:'production',
 COMMERCE_LIVE:'true',
 RESEND_API_KEY:'x',
 ORDER_EMAIL_FROM:'Nutretium <pedidos@nutretium.com>',
 MAINTENANCE_MODE:'false',
};

const ok=sentinel.evaluateEnv(base);
assert.deepStrictEqual(sentinel.missingFrom(ok),[],'una configuración de entorno completa debe quedar lista antes de checks runtime');

const publicAdmin=sentinel.evaluateEnv({...base,ADMIN_EMAILS:'pedidos@nutretium.com'});
assert.strictEqual(publicAdmin.adminIsolation,false,'el correo administrativo no puede ser el público');

const noMfa=sentinel.evaluateEnv({...base,REQUIRE_STAFF_MFA:'false'});
assert.strictEqual(noMfa.staffMfaRequired,false,'MFA debe ser obligatorio');

const testBank=sentinel.evaluateEnv({...base,REDSYS_ENV:'test'});
assert.strictEqual(testBank.redsysProduction,false,'producción no puede declarar listo Redsys en test');

const maintenance=sentinel.evaluateEnv({...base,MAINTENANCE_MODE:'true'});
assert.strictEqual(maintenance.maintenanceOff,false,'mantenimiento bloquea readiness');

const managedPayment=sentinel.paymentChecks({managed:true,environment:'production',commerceLive:true,merchantCode:'x',secretKey:'x',dedicatedVaultKey:true});
assert.deepStrictEqual(sentinel.missingFrom(managedPayment),[],'Redsys gestionado requiere credenciales, producción, live y bóveda dedicada');
const sharedKey=sentinel.paymentChecks({managed:true,environment:'production',commerceLive:true,merchantCode:'x',secretKey:'x',dedicatedVaultKey:false});
assert.strictEqual(sharedKey.dedicatedVaultKey,false,'una bóveda gestionada de producción no puede reutilizar otra clave');

assert.strictEqual(mfaReadiness.validSecret(validTotp),true,'un secreto TOTP base32 válido debe aceptarse');
assert.strictEqual(mfaReadiness.validSecret('not-a-secret'),false,'un valor arbitrario no debe contar como TOTP válido');
assert.strictEqual(mfaReadiness.envSecretFor('owner-private@nutretium.com',base),validTotp,'el mapa JSON legacy válido debe seguir siendo compatible');
assert.strictEqual(mfaReadiness.envSecretFor('owner-private@nutretium.com',{STAFF_TOTP_SECRETS:'owner-private@nutretium.com:'+validTotp}),'','el formato no JSON no debe producir falso verde');

const targets=mfaReadiness.requiredStaffEmails({ADMIN_EMAILS:'admin@nutretium.com, appnutretium@gmail.com',MANAGER_EMAILS:'manager@nutretium.com',STAFF_ROLES_JSON:JSON.stringify({'custom@nutretium.com':['orders.read']})},[{email:'operator@nutretium.com',role:'operator',active:true},{email:'disabled@nutretium.com',role:'support',active:false}]);
assert.deepStrictEqual(targets,['admin@nutretium.com','custom@nutretium.com','manager@nutretium.com','operator@nutretium.com'],'el propietario exento y el personal inactivo no deben bloquear readiness');

const previousKey=process.env.MFA_ENCRYPTION_KEY;
process.env.MFA_ENCRYPTION_KEY='test-readiness-master-key';
try{
 const user={mfaSecretEncrypted:totp.sealSecret(validTotp)};
 assert.strictEqual(mfaReadiness.configuredSecret('manager@nutretium.com',user,{}),true,'el MFA cifrado por usuario debe contar como configuración efectiva');
 assert.strictEqual(mfaReadiness.configuredSecret('manager@nutretium.com',null,{STAFF_TOTP_SECRETS:JSON.stringify({'manager@nutretium.com':validTotp})}),true,'el mapa JSON legacy válido debe contar');
 assert.strictEqual(mfaReadiness.configuredSecret('manager@nutretium.com',null,{STAFF_TOTP_SECRETS:'garbage'}),false,'una variable malformada no debe contar como MFA');
}finally{
 if(previousKey===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=previousKey;
}

assert.strictEqual(
 sentinel.signature({ready:false,missing:['b','a']}),
 sentinel.signature({ready:false,missing:['a','b']}),
 'la firma debe ser estable independientemente del orden'
);

console.log('[test-production-readiness] OK · MFA efectivo · aislamiento admin · Redsys producción · bóveda dedicada · mantenimiento · firma estable');
