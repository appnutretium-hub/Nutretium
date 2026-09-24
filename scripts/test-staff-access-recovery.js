'use strict';
const assert=require('assert');
const crypto=require('crypto');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
process.env.OWNER_EMAILS='recovery-owner@nutretium.test';
process.env.ADMIN_EMAILS='recovery-admin@nutretium.test';
process.env.REQUIRE_STAFF_MFA='true';
process.env.CONTEXT='test';
globalThis.__NUTRETIUM_TEST_BLOBS__=new Map();
globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map();
globalThis.__NUTRETIUM_RATE_LIMIT_FALLBACK__=new Map();
const usuarios=require('../netlify/lib/usuarios');
const passwords=require('../netlify/lib/passwords');
const totp=require('../netlify/lib/totp');
const staffLogin=require('../netlify/functions/staff-login');
const ownerEmail='recovery-owner@nutretium.test',adminEmail='recovery-admin@nutretium.test',password='Recovery-Owner-2026!';
const base=email=>({id:'recovery-'+email,name:'Recovery',surname:'Staff',email,phone:'',direccion:{},passwordHash:passwords.hashPassword(password),sessionVersion:0,createdAt:new Date().toISOString()});
const event=(body,ip='127.0.0.55')=>({httpMethod:'POST',headers:{'content-type':'application/json','x-nf-client-connection-ip':ip},body:JSON.stringify(body)});
const parse=r=>JSON.parse(r.body||'{}');
(async()=>{
 await usuarios.escribe(ownerEmail,base(ownerEmail));
 const ownerSetupResponse=await staffLogin.handler(event({email:ownerEmail,password}));
 const ownerSetup=parse(ownerSetupResponse);
 assert.strictEqual(ownerSetupResponse.statusCode,401,'Owner sin MFA debe entrar en alta guiada');
 assert.strictEqual(ownerSetup.mfaRequired,true,'Owner debe exigir MFA');
 assert.strictEqual(ownerSetup.mfaSetupRequired,true,'Primer acceso owner debe indicar configuración MFA');
 assert.ok(/^[A-Z2-7]{16,}$/.test(ownerSetup.mfa?.setupSecret||''),'Owner debe recibir un secreto TOTP Base32 válido');
 const ownerCode=totp.code(ownerSetup.mfa.setupSecret);
 const ownerOk=await staffLogin.handler(event({email:ownerEmail,password,mfaCode:ownerCode}));
 assert.strictEqual(ownerOk.statusCode,200,'Owner debe acceder tras verificar MFA');
 assert.strictEqual(parse(ownerOk).user.role,'owner');
 assert.strictEqual(parse(ownerOk).user.mfa,true,'Owner debe entrar con MFA verificado');
 assert.strictEqual(parse(ownerOk).user.mfaRequired,true,'Owner debe mantener segundo factor obligatorio');

 const wrongIp='127.0.0.77';for(let i=0;i<5;i++){const bad=await staffLogin.handler(event({email:ownerEmail,password:'incorrecta-'+i},wrongIp));assert.strictEqual(bad.statusCode,401)}
 const freshOwner=await usuarios.lee(ownerEmail);const ownerSecret=totp.secretFor(ownerEmail,freshOwner);const validOwnerCode=totp.code(ownerSecret,Date.now()+30000);
 const validAfterBad=await staffLogin.handler(event({email:ownerEmail,password,mfaCode:validOwnerCode},wrongIp));assert.strictEqual(validAfterBad.statusCode,200,'Credenciales owner válidas con MFA deben recuperar el acceso tras errores previos');
 assert.strictEqual(parse(validAfterBad).user.mfaRequired,true);

 await usuarios.escribe(adminEmail,base(adminEmail));
 const setupResponse=await staffLogin.handler(event({email:adminEmail,password},'127.0.0.88'));
 const setup=parse(setupResponse);
 assert.strictEqual(setupResponse.statusCode,401,'Admin sin MFA debe entrar en alta guiada, no quedar bloqueado con 503');
 assert.strictEqual(setup.mfaRequired,true,'Admin debe seguir protegido por MFA');
 assert.strictEqual(setup.mfaSetupRequired,true,'Primer acceso admin debe indicar que MFA necesita configuración');
 assert.ok(/^[A-Z2-7]{16,}$/.test(setup.mfa?.setupSecret||''),'Debe entregarse un secreto TOTP Base32 válido después de verificar contraseña');
 assert.ok(String(setup.mfa?.provisioningUri||'').startsWith('otpauth://totp/'),'Debe entregarse URI de aprovisionamiento TOTP');

 const repeatedSetup=await staffLogin.handler(event({email:adminEmail,password},'127.0.0.88'));
 assert.strictEqual(repeatedSetup.statusCode,401,'Recargar el alta MFA no debe invalidar la configuración pendiente');
 assert.strictEqual(parse(repeatedSetup).mfa?.setupSecret,setup.mfa.setupSecret,'La clave pendiente debe ser estable hasta verificar el primer código');

 const wrongMfa=await staffLogin.handler(event({email:adminEmail,password,mfaCode:'000000'},'127.0.0.88'));
 assert.strictEqual(wrongMfa.statusCode,401,'Un MFA incorrecto no debe abrir sesión');
 assert.strictEqual(parse(wrongMfa).mfaRequired,true);

 const code=totp.code(setup.mfa.setupSecret);
 const adminOk=await staffLogin.handler(event({email:adminEmail,password,mfaCode:code},'127.0.0.88'));
 const adminBody=parse(adminOk);
 assert.strictEqual(adminOk.statusCode,200,'Admin debe acceder después de verificar el MFA recién configurado');
 assert.strictEqual(adminBody.user.role,'admin');
 assert.strictEqual(adminBody.user.mfa,true);
 assert.strictEqual(adminBody.user.mfaRequired,true);
 const stored=await usuarios.lee(adminEmail);
 assert.strictEqual(stored.mfaEnabled,true,'MFA debe quedar activado en la cuenta admin');
 assert.ok(stored.mfaConfiguredAt,'MFA debe quedar marcado como configurado');
 assert.ok(stored.mfaVerifiedAt,'MFA debe quedar marcado como verificado');
 assert.ok(!stored.mfaSelfSetupPendingAt,'El estado de alta pendiente debe limpiarse tras verificar el código');
 assert.strictEqual(totp.secretFor(adminEmail,stored),setup.mfa.setupSecret,'El secreto cifrado persistido debe coincidir con el aprovisionado');

 console.log('[test-staff-access-recovery] OK · owner/admin alta MFA guiada · código TOTP verificado · acceso recuperable');
})().catch(err=>{console.error(err);process.exit(1)});
