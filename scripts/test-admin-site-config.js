'use strict';
const assert=require('assert');
const fs=require('fs');
const settings=require('../netlify/lib/settings');

function testNormalization(){
 const nav=Array.from({length:30},(_,i)=>({id:`X ${i}`,label:`Item <${i}>`,href:i===0?'javascript:alert(1)':`#item-${i}`,enabled:true,order:30-i}));
 const n=settings.normalize({
  content:{bannerText:'<script>alert(1)</script>',heroTitle:'<b>Potencia</b>'},
  navigation:{managed:true,items:nav},
  contact:{phone:'+34 633 753 517',email:'OWNER@EXAMPLE.COM',hours:'09:30 - 22:00'},
  seo:{siteTitle:'<title>Unsafe</title>',metaDescription:'Nutretium <strong>safe</strong>'},
  payment:{managed:true,enabled:true,environment:'production',commerceLive:true,terminal:'01',merchantUrl:'http://insecure.test/callback',urlOk:'https://nutretium.com/ok'},
  shipping:{managed:true,enabled:true,rateCents:490,freeFromCents:5000,country:'España',label:'Envío'}
 });
 assert.equal(n.navigation.items.length,24,'navigation must be capped at 24 items');
 assert.equal(n.navigation.items.find(x=>x.id==='x-0').href,'#','unsafe href must fail closed');
 assert(!JSON.stringify(n).includes('<script>'),'HTML must be stripped from settings');
 assert.equal(n.contact.email,'owner@example.com');
 assert.equal(n.payment.environment,'production');
 assert.equal(n.payment.merchantUrl,'','payment URLs must require HTTPS');
 assert.equal(n.payment.urlOk,'https://nutretium.com/ok');
 assert.equal(n.shipping.rateCents,490);
}

function testVaultCrypto(){
 const previous=process.env.CONFIG_VAULT_KEY;process.env.CONFIG_VAULT_KEY='test-only-admin-site-config-key-2026';
 delete require.cache[require.resolve('../netlify/lib/config-vault')];
 const vault=require('../netlify/lib/config-vault');
 const secret='super-secret-redsys-test-key';
 const sealed=vault._test.seal({merchantCode:'999008881',secretKey:secret});
 assert.equal(sealed.alg,'AES-256-GCM');
 assert(!JSON.stringify(sealed).includes(secret),'ciphertext must not expose the secret');
 const opened=vault._test.open(sealed);assert.equal(opened.secretKey,secret);assert.equal(opened.merchantCode,'999008881');
 const tampered={...sealed,data:sealed.data.slice(0,-2)+'AA'};assert.equal(vault._test.open(tampered),null,'tampering must fail authentication');
 if(previous===undefined)delete process.env.CONFIG_VAULT_KEY;else process.env.CONFIG_VAULT_KEY=previous;
}

function testWiring(){
 const admin=fs.readFileSync('netlify/functions/admin-settings.js','utf8');
 const publicConfig=fs.readFileSync('netlify/functions/site-config.js','utf8');
 const runtime=fs.readFileSync('runtime-content.js','utf8');
 const shipping=fs.readFileSync('netlify/lib/shipping.js','utf8');
 const notify=fs.readFileSync('netlify/functions/redsys-notify.js','utf8');
 const refund=fs.readFileSync('netlify/functions/refund-redsys.js','utf8');
 const status=fs.readFileSync('netlify/functions/site-status.js','utf8');
 const html=fs.readFileSync('settings.html','utf8');
 assert(admin.includes("staff.role!=='owner'"),'payment credentials must be owner-only');
 assert(!publicConfig.includes('secretKey:'),'public config must never serialize secretKey');
 assert(!publicConfig.includes('merchantCode:'),'public config must never serialize merchantCode');
 assert(runtime.includes('ntManagedNavigation')&&runtime.includes('nutretium:site-config'),'storefront must consume managed config');
 assert(shipping.includes('paymentConfig.applyRuntime()'),'checkout path must load managed payment config');
 assert(notify.includes('paymentConfig.applyRuntime()'),'Redsys callback must load managed payment config');
 assert(refund.includes('paymentConfig.applyRuntime()'),'refund flow must load managed payment config');
 assert(status.includes('paymentConfig.publicStatus()'),'production status must use managed payment config');
 assert(html.includes('type="password"')&&html.includes('paymentSecretKey'),'admin panel must mask the payment secret');
 assert(html.includes('navigationItems')&&html.includes('shippingEnabled')&&html.includes('paymentManaged'),'admin panel must expose navigation, shipping and payment configuration');
}

testNormalization();testVaultCrypto();testWiring();
console.log('[admin-site-config] OK · normalización, bóveda y sincronización verificadas');
