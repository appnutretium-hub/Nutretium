'use strict';
const crypto=require('crypto');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
process.env.OWNER_EMAILS='owner@nutretium.test';
process.env.ADMIN_EMAILS='';
process.env.REQUIRE_STAFF_MFA='true';

const assert=require('assert');
const fs=require('fs');
const usuarios=require('../netlify/lib/usuarios');
const {signJWT}=require('../netlify/lib/jwt');
const {getBlobStore}=require('../netlify/lib/blob-store');
const adminSession=require('../netlify/functions/admin-session');
const staffLogin=require('../netlify/functions/staff-login');
const defense=require('../netlify/lib/security-defense');
const totp=require('../netlify/lib/totp');
const adminAudit=require('../netlify/functions/admin-audit');
const audit=require('../netlify/lib/audit-log');

const email='owner@nutretium.test';
const user={id:'owner-test',name:'Owner',surname:'Nutretium',email,phone:'',direccion:{calle:'Calle Test 1',piso:'',cp:'39001',localidad:'Santander',provincia:'Cantabria',pais:'España'},passwordHash:'x'};
const baseHeaders={'x-nf-client-connection-ip':'127.0.0.90'};
const event=(body,headers={})=>({httpMethod:'POST',headers:{...baseHeaders,...headers},body:JSON.stringify(body)});
const parse=r=>JSON.parse(r.body||'{}');
function staffToken(mfa){const binding=defense.newSessionBinding(event({}));return signJWT({sub:user.id,email,role:'owner',kind:'staff-login',mfa:Boolean(mfa),sv:0,fp:binding.fp,jti:binding.jti,exp:Math.floor(Date.now()/1000)+3600});}
const customerBearer=signJWT({sub:user.id,email,kind:'customer',sv:0,exp:Math.floor(Date.now()/1000)+3600});

(async()=>{
 await usuarios.escribe(email,user);
 assert.strictEqual(staffLogin._test.privilegedMfaExempt('owner'),true,'Owner debe poder acceder con correo y contraseña sin MFA');
 assert.strictEqual(staffLogin._test.privilegedMfaExempt('admin'),false,'Admin no queda exento de MFA');
 assert.strictEqual(staffLogin._test.privilegedMfaExempt('manager'),false,'Manager no queda exento por rol');
 assert.strictEqual(staffLogin._test.mfaRequiredFor('admin',{mfaEnabled:false}),true,'Admin exige MFA siempre');
 assert.strictEqual(staffLogin._test.mfaRequiredFor('owner',{mfaEnabled:true}),false,'Owner usa acceso por contraseña aunque exista configuración MFA antigua');
 assert.strictEqual(staffLogin._test.mfaRequiredFor('manager',{mfaEnabled:false}),true,'La política global exige MFA al resto del personal');
 const generated=totp.generateSecret();assert(/^[A-Z2-7]+$/.test(generated),'El secreto generado debe ser Base32');const sealed=totp.sealSecret(generated);assert.notStrictEqual(sealed,generated,'El secreto no debe persistirse en claro');assert.strictEqual(totp.openSecret(sealed),generated,'El cifrado MFA debe ser reversible con la clave del servidor');

 const customerExchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${customerBearer}`}));
 assert.strictEqual(customerExchange.statusCode,401,'Un JWT de cliente nunca puede convertirse en sesión interna');
 const ownerExchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${staffToken(false)}`}));
 assert.strictEqual(ownerExchange.statusCode,200,'Owner debe poder crear sesión interna sin MFA');
 assert.strictEqual(parse(ownerExchange).mfa,false,'La sesión owner debe reflejar que no usó MFA');
 const ownerCookie=ownerExchange.headers['Set-Cookie'];assert(ownerCookie&&/nt_staff_session=/.test(ownerCookie),'Debe emitirse la cookie interna');assert(/HttpOnly/i.test(ownerCookie),'La cookie debe ser HttpOnly');assert(/Secure/i.test(ownerCookie),'La cookie debe ser Secure');assert(/SameSite=Strict/i.test(ownerCookie),'La cookie debe ser SameSite=Strict');
 const cookiePair=ownerCookie.split(';')[0];
 const status=await adminSession.handler(event({action:'status'},{cookie:cookiePair}));assert.strictEqual(status.statusCode,200,'La cookie owner debe autenticar la sesión interna');assert.strictEqual(parse(status).email,email);assert.strictEqual(parse(status).mfa,false);
 const exchange=await adminSession.handler(event({action:'exchange'},{authorization:`Bearer ${staffToken(true)}`}));assert.strictEqual(exchange.statusCode,200,'Owner con MFA también debe seguir siendo compatible');

 const writes=await Promise.all(Array.from({length:12},(_,i)=>audit.append({event:event({},{}),actor:email,action:'TEST_EVENT',resource:`resource-${i}`,metadata:{i,token:'must-redact'}})));assert.strictEqual(writes.length,12);assert(writes.every(row=>row.metadata.token==='[REDACTED]'),'El audit log debe censurar tokens');
 const verification=await audit.verify(100);assert.strictEqual(verification.valid,true,'La cadena concurrente debe ser válida');assert.strictEqual(verification.checked,12,'Debe verificar los 12 eventos');
 const list=await adminAudit.handler(event({action:'list',limit:20},{cookie:cookiePair}));assert.strictEqual(list.statusCode,200,'El endpoint de auditoría debe aceptar cookie owner');assert.strictEqual(parse(list).events.length,12);
 const verifyEndpoint=await adminAudit.handler(event({action:'verify',limit:100},{cookie:cookiePair}));assert.strictEqual(verifyEndpoint.statusCode,200);assert.strictEqual(parse(verifyEndpoint).valid,true);
 const head=await getBlobStore('security-audit').get('chain-head',{type:'json'});const latest=await getBlobStore('security-audit').get(head.key,{type:'json'});await getBlobStore('security-audit').setJSON(head.key,{...latest,action:'TAMPERED'});const tampered=await audit.verify(100);assert.strictEqual(tampered.valid,false,'Una alteración debe romper la verificación criptográfica');
 const adminHtml=fs.readFileSync('admin.html','utf8'),backofficeHtml=fs.readFileSync('backoffice.html','utf8');assert(adminHtml.includes('/staff-session-bridge.js'),'El build debe inyectar el puente en admin');assert(backofficeHtml.includes('/staff-session-bridge.js'),'El build debe inyectar el puente en backoffice');
 const bridge=fs.readFileSync('staff-session-bridge.js','utf8');assert(bridge.includes("STAFF_LOGIN_ENDPOINT='/.netlify/functions/staff-login'"),'El puente debe reconocer el login específico de staff');assert(bridge.includes('exchangeStaffToken(token)'),'El login de staff debe canjear el JWT por la cookie interna');assert(!bridge.includes('localStorage.setItem(SESSION)'),'El puente no debe persistir el JWT interno');assert(bridge.includes('if(this===window.localStorage&&key===KEY)return;'),'El puente debe bloquear persistencia del usuario interno en localStorage');
 const loginUi=fs.readFileSync('staff-login-ui.js','utf8');assert(!/localStorage\.setItem\(\s*KEY\b/.test(loginUi),'La UI de acceso interno no debe persistir datos o tokens de staff en localStorage');
 const logout=await adminSession.handler(event({action:'logout'},{cookie:cookiePair}));assert.strictEqual(logout.statusCode,200);assert(/Max-Age=0/.test(logout.headers['Set-Cookie']),'Logout debe expirar la cookie');
 console.log('[test-admin-security] OK · owner password-only · browser-bound session · MFA admin · cookie HttpOnly · auditoría íntegra');
})().catch(err=>{console.error(err);process.exit(1)});
