'use strict';
const crypto=require('crypto');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
process.env.ADMIN_EMAILS='owner@nutretium.test';
process.env.REQUIRE_STAFF_MFA='true';

const assert=require('assert');
const fs=require('fs');
const usuarios=require('../netlify/lib/usuarios');
const {signJWT}=require('../netlify/lib/jwt');
const {getBlobStore}=require('../netlify/lib/blob-store');
const adminSession=require('../netlify/functions/admin-session');
const staffLogin=require('../netlify/functions/staff-login');
const totp=require('../netlify/lib/totp');
const temporaryAccess=require('../netlify/lib/temporary-access');
const adminAudit=require('../netlify/functions/admin-audit');
const audit=require('../netlify/lib/audit-log');

const email='owner@nutretium.test';
const user={id:'owner-test',name:'Owner',surname:'Nutretium',email,phone:'',direccion:{calle:'Calle Test 1',piso:'',cp:'39001',localidad:'Santander',provincia:'Cantabria',pais:'España'},passwordHash:'x'};
const customerBearer=signJWT({sub:user.id,email,exp:Math.floor(Date.now()/1000)+3600});
const staffWithoutMfa=signJWT({sub:user.id,email,kind:'staff-login',mfa:false,exp:Math.floor(Date.now()/1000)+3600});
const staffBadRecovery=signJWT({sub:user.id,email,kind:'staff-login',mfa:false,mfaBypass:true,mfaBypassUntil:temporaryAccess.MFA_BYPASS_UNTIL-1,exp:Math.floor(Date.now()/1000)+3600});
const staffRecovery=signJWT({sub:user.id,email,kind:'staff-login',mfa:false,mfaBypass:true,mfaBypassUntil:temporaryAccess.MFA_BYPASS_UNTIL,exp:Math.floor(Date.now()/1000)+3600});
const staffBearer=signJWT({sub:user.id,email,kind:'staff-login',mfa:true,exp:Math.floor(Date.now()/1000)+3600});
const baseHeaders={'x-nf-client-connection-ip':'127.0.0.90'};
const event=(body,headers={})=>({httpMethod:'POST',headers:{...baseHeaders,...headers},body:JSON.stringify(body)});
const parse=r=>JSON.parse(r.body||'{}');

(async()=>{
 await usuarios.escribe(email,user);
 assert.strictEqual(staffLogin._test.privilegedMfaExempt('owner'),true,'Owner debe quedar exento solo durante la ventana de recuperación');
 assert.strictEqual(staffLogin._test.privilegedMfaExempt('admin'),true,'Admin debe quedar exento solo durante la ventana de recuperación');
 assert.strictEqual(staffLogin._test.privilegedMfaExempt('manager'),false,'La recuperación nunca aplica a otros roles');
 assert.strictEqual(staffLogin._test.mfaRequiredFor('admin',{mfaEnabled:false}),false,'Admin no exige MFA durante la ventana aprobada');
 assert.strictEqual(staffLogin._test.mfaRequiredFor('owner',{mfaEnabled:false}),false,'Owner no exige MFA durante la ventana aprobada');
 assert.strictEqual(staffLogin._test.mfaRequiredFor('manager',{mfaEnabled:false}),true,'La política global sigue exigiendo MFA al resto del personal');
 assert.strictEqual(temporaryAccess.privilegedMfaBypassActive('owner',temporaryAccess.MFA_BYPASS_UNTIL+1),false,'La excepción debe caducar automáticamente');
 assert.strictEqual(temporaryAccess.claimAllowsPrivilegedBypass('owner',{mfaBypass:true,mfaBypassUntil:temporaryAccess.MFA_BYPASS_UNTIL},temporaryAccess.MFA_BYPASS_UNTIL+1),false,'Un claim de recuperación no puede sobrevivir al vencimiento');
 const generated=totp.generateSecret();assert(/^[A-Z2-7]+$/.test(generated),'El secreto generado debe ser Base32');const sealed=totp.sealSecret(generated);assert.notStrictEqual(sealed,generated,'El secreto no debe persistirse en claro');assert.strictEqual(totp.openSecret(sealed),generated,'El cifrado MFA debe ser reversible con la clave del servidor');assert(totp.provisioningUri('empleado@nutretium.test',generated).startsWith('otpauth://totp/'),'Debe generarse una URI estándar de aprovisionamiento');

 const customerExchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${customerBearer}`}));
 assert.strictEqual(customerExchange.statusCode,401,'Un JWT de cliente nunca puede convertirse en sesión interna');
 const noMfaExchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${staffWithoutMfa}`}));
 assert.strictEqual(noMfaExchange.statusCode,401,'Un token de personal sin MFA ni claim de recuperación sigue rechazado');
 const badRecoveryExchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${staffBadRecovery}`}));
 assert.strictEqual(badRecoveryExchange.statusCode,401,'Un claim de recuperación manipulado debe rechazarse');
 const recoveryExchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${staffRecovery}`}));
 assert.strictEqual(recoveryExchange.statusCode,200,'Owner/Admin puede canjear únicamente el claim temporal exacto');
 assert.strictEqual(parse(recoveryExchange).mfaRecovery,true,'La sesión debe quedar marcada como recuperación MFA');
 const recoveryCookie=recoveryExchange.headers['Set-Cookie'].split(';')[0];
 const recoveryStatus=await adminSession.handler(event({action:'status'},{cookie:recoveryCookie}));
 assert.strictEqual(recoveryStatus.statusCode,200);assert.strictEqual(parse(recoveryStatus).mfaRecovery,true);

 const exchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${staffBearer}`}));
 assert.strictEqual(exchange.statusCode,200,'El intercambio sigue aceptando staff-login verificado con MFA');
 const setCookie=exchange.headers['Set-Cookie'];
 assert(setCookie&&/nt_staff_session=/.test(setCookie),'Debe emitirse la cookie interna');
 assert(/HttpOnly/i.test(setCookie),'La cookie debe ser HttpOnly');
 assert(/Secure/i.test(setCookie),'La cookie debe ser Secure');
 assert(/SameSite=Strict/i.test(setCookie),'La cookie debe ser SameSite=Strict');
 const cookiePair=setCookie.split(';')[0];
 const status=await adminSession.handler(event({action:'status'},{cookie:cookiePair}));
 assert.strictEqual(status.statusCode,200,'La cookie debe autenticar la sesión interna');
 assert.strictEqual(parse(status).email,email);

 const writes=await Promise.all(Array.from({length:12},(_,i)=>audit.append({event:event({},{}),actor:email,action:'TEST_EVENT',resource:`resource-${i}`,metadata:{i,token:'must-redact'}})));
 assert.strictEqual(writes.length,12);
 assert(writes.every(row=>row.metadata.token==='[REDACTED]'),'El audit log debe censurar tokens');
 const verification=await audit.verify(100);
 assert.strictEqual(verification.valid,true,'La cadena concurrente debe ser válida');
 assert.strictEqual(verification.checked,12,'Debe verificar los 12 eventos');

 const list=await adminAudit.handler(event({action:'list',limit:20},{cookie:cookiePair}));
 assert.strictEqual(list.statusCode,200,'El endpoint de auditoría debe aceptar cookie interna');
 assert.strictEqual(parse(list).events.length,12);
 const verifyEndpoint=await adminAudit.handler(event({action:'verify',limit:100},{cookie:cookiePair}));
 assert.strictEqual(verifyEndpoint.statusCode,200);assert.strictEqual(parse(verifyEndpoint).valid,true);

 const head=await getBlobStore('security-audit').get('chain-head',{type:'json'});
 const latest=await getBlobStore('security-audit').get(head.key,{type:'json'});
 await getBlobStore('security-audit').setJSON(head.key,{...latest,action:'TAMPERED'});
 const tampered=await audit.verify(100);
 assert.strictEqual(tampered.valid,false,'Una alteración debe romper la verificación criptográfica');

 const adminHtml=fs.readFileSync('admin.html','utf8'),backofficeHtml=fs.readFileSync('backoffice.html','utf8');
 assert(adminHtml.includes('/staff-session-bridge.js'),'El build debe inyectar el puente en admin');
 assert(backofficeHtml.includes('/staff-session-bridge.js'),'El build debe inyectar el puente en backoffice');
 const bridge=fs.readFileSync('staff-session-bridge.js','utf8');
 assert(bridge.includes("STAFF_LOGIN_ENDPOINT='/.netlify/functions/staff-login'"),'El puente debe reconocer el login específico de staff');
 assert(bridge.includes('exchangeStaffToken(token)'),'El login de staff debe canjear el JWT por la cookie interna');
 assert(!bridge.includes('localStorage.setItem(SESSION)'),'El puente no debe persistir el JWT interno');

 const logout=await adminSession.handler(event({action:'logout'},{cookie:cookiePair}));
 assert.strictEqual(logout.statusCode,200);assert(/Max-Age=0/.test(logout.headers['Set-Cookie']),'Logout debe expirar la cookie');
 console.log('[test-admin-security] OK · recuperación MFA temporal firmada y autoexpirable · cliente no escala · cookie HttpOnly · auditoría íntegra');
})().catch(err=>{console.error(err);process.exit(1)});
