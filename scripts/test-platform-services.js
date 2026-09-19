'use strict';
const assert=require('assert');const hooks=require('../netlify/lib/webhooks');const worker=require('../netlify/functions/notification-worker')._test;const totp=require('../netlify/lib/totp');const guest=require('../netlify/lib/guest-access');const refund=require('../netlify/functions/refund-redsys')._test;let n=0;function t(name,fn){fn();n++;console.log('✓',name)}
t('firma webhook HMAC estable',()=>assert.strictEqual(hooks.signature('secret','body'),hooks.signature('secret','body')));
t('firma cambia con payload',()=>assert.notStrictEqual(hooks.signature('secret','body'),hooks.signature('secret','body2')));
t('plantillas sustituyen variables',()=>assert.strictEqual(worker.render('Hola {{name}}',{name:'Ana'}),'Hola Ana'));
t('variable inexistente queda vacía',()=>assert.strictEqual(worker.render('{{missing}}',{}),''));
t('TOTP genera seis dígitos',()=>assert(/^\d{6}$/.test(totp.code('JBSWY3DPEHPK3PXP',1700000000000))));
t('TOTP verifica su propio código',()=>{const now=1700000000000,c=totp.code('JBSWY3DPEHPK3PXP',now);assert.strictEqual(totp.verify('JBSWY3DPEHPK3PXP',c,now),true)});
t('token invitado firmado solo valida su pedido y email',()=>{process.env.GUEST_ORDER_SECRET='secreto-invitados-de-prueba-con-32-caracteres';const token=guest.tokenFor('123456789012','ana@example.com');assert(token);assert.strictEqual(guest.verify('123456789012','ana@example.com',token),true);assert.strictEqual(guest.verify('123456789013','ana@example.com',token),false)});
t('firma de devolución es determinista',()=>{const key=Buffer.alloc(24,1).toString('base64'),p=Buffer.from('{"x":1}').toString('base64');assert.strictEqual(refund.sign(p,key,'123456789012'),refund.sign(p,key,'123456789012'))});
console.log(`\n${n} pruebas de servicios superadas.`);
