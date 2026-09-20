'use strict';
const assert=require('assert');
const sentinel=require('../netlify/functions/production-sentinel')._test;

const base={
 JWT_SECRET:'x',
 ADMIN_EMAILS:'owner-private@nutretium.com',
 CONTACT_EMAIL:'contacto@nutretium.com',
 ORDER_NOTIFICATION_EMAIL:'pedidos@nutretium.com',
 REQUIRE_STAFF_MFA:'true',
 STAFF_TOTP_SECRETS:'owner-private@nutretium.com:JBSWY3DPEHPK3PXP',
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
assert.deepStrictEqual(sentinel.missingFrom(ok),[],'una configuración completa debe quedar lista');

const publicAdmin=sentinel.evaluateEnv({...base,ADMIN_EMAILS:'pedidos@nutretium.com'});
assert.strictEqual(publicAdmin.adminIsolation,false,'el correo administrativo no puede ser el público');

const noMfa=sentinel.evaluateEnv({...base,REQUIRE_STAFF_MFA:'false'});
assert.strictEqual(noMfa.staffMfaRequired,false,'MFA debe ser obligatorio');

const testBank=sentinel.evaluateEnv({...base,REDSYS_ENV:'test'});
assert.strictEqual(testBank.redsysProduction,false,'producción no puede declarar listo Redsys en test');

const maintenance=sentinel.evaluateEnv({...base,MAINTENANCE_MODE:'true'});
assert.strictEqual(maintenance.maintenanceOff,false,'mantenimiento bloquea readiness');

assert.strictEqual(
 sentinel.signature({ready:false,missing:['b','a']}),
 sentinel.signature({ready:false,missing:['a','b']}),
 'la firma debe ser estable independientemente del orden'
);

console.log('[test-production-readiness] OK · MFA · aislamiento admin · Redsys producción · mantenimiento · firma estable');
