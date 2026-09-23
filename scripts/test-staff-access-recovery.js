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
 const first=await staffLogin.handler(event({email:ownerEmail,password}));
 assert.strictEqual(first.statusCode,200,'Owner debe acceder directamente con correo y contraseña');
 assert.strictEqual(parse(first).user.role,'owner');
 assert.strictEqual(parse(first).user.mfa,false,'Owner no debe requerir MFA');
 assert.strictEqual(parse(first).user.mfaRequired,false,'Owner no debe recibir segundo factor');
 const wrongIp='127.0.0.77';for(let i=0;i<5;i++){const bad=await staffLogin.handler(event({email:ownerEmail,password:'incorrecta-'+i},wrongIp));assert.strictEqual(bad.statusCode,401)}
 const validAfterBad=await staffLogin.handler(event({email:ownerEmail,password},wrongIp));assert.strictEqual(validAfterBad.statusCode,200,'Una contraseña owner válida debe recuperar el acceso tras errores previos');
 assert.strictEqual(parse(validAfterBad).user.mfaRequired,false);

 const bruteEmail='rate-limit@nutretium.test',bruteIp='127.0.0.99';
 for(let i=0;i<6;i++){
  const bad=await staffLogin.handler(event({email:bruteEmail,password:'incorrecta-rate-'+i},bruteIp));
  assert.strictEqual(bad.statusCode,401,`Intento inválido ${i+1} debe seguir respondiendo credenciales incorrectas antes del límite`);
 }
 const throttled=await staffLogin.handler(event({email:bruteEmail,password:'incorrecta-rate-6'},bruteIp));
 assert.strictEqual(throttled.statusCode,429,'El séptimo intento inválido debe activar rate limit observable');
 assert.ok(Number(throttled.headers?.['Retry-After'])>=1,'El rate limit debe indicar Retry-After');
 assert.match(parse(throttled).error,/Demasiados intentos/i,'El cliente debe recibir un mensaje de throttle no ambiguo');

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

 console.log('[test-staff-access-recovery] OK · owner correo+contraseña · rate limit observable · admin alta MFA guiada · código TOTP verificado · acceso recuperable');
})().catch(err=>{console.error(err);process.exit(1)});
