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
  shipping:{managed:true,enabled:true,rateCents:null,freeFromCents:5000,country:'España',label:'Envío',methods:[{id:'Cantabria 1',name:'Cantabria',country:'España',postalPrefixes:['39','39',' 40 '],rateCents:390,freeFromCents:4500,eta:'24/48 h',enabled:true}]},
  integrations:{email:{managed:true,enabled:true,from:'Nutretium <pedidos@nutretium.com>',orderNotificationEmail:'PEDIDOS@NUTRETIUM.COM'},tpvsol:{managed:true,enabled:true,mode:'api',endpoint:'https://tpv.example/sync',validated:true}}
 });
 assert.equal(n.navigation.items.length,24,'navigation must be capped at 24 items');
 assert.equal(n.navigation.items.find(x=>x.id==='x0').href,'#','unsafe href must fail closed');
 assert(!JSON.stringify(n).includes('<script>'),'HTML must be stripped from settings');
 assert.equal(n.contact.email,'owner@example.com');
 assert.equal(n.payment.environment,'production');
 assert.equal(n.payment.merchantUrl,'','payment URLs must require HTTPS');
 assert.equal(n.payment.urlOk,'https://nutretium.com/ok');
 assert.equal(n.shipping.methods.length,1);
 assert.deepEqual(n.shipping.methods[0].postalPrefixes,['39','40']);
 assert.equal(n.shipping.methods[0].rateCents,390);
 assert.equal(n.integrations.email.orderNotificationEmail,'pedidos@nutretium.com');
 assert.equal(n.integrations.tpvsol.mode,'api');
 assert.equal(n.integrations.tpvsol.endpoint,'https://tpv.example/sync');
}

function testVaultCrypto(){
 const previous=process.env.CONFIG_VAULT_KEY;process.env.CONFIG_VAULT_KEY='test-only-admin-site-config-key-2026';
 delete require.cache[require.resolve('../netlify/lib/config-vault')];
 const vault=require('../netlify/lib/config-vault');
 const payload={merchantCode:'999008881',secretKey:'super-secret-redsys-test-key',apiKey:'not-stored-together'};
 const sealed=vault._test.seal(payload);
 assert.equal(sealed.alg,'AES-256-GCM');
 assert(!JSON.stringify(sealed).includes(payload.secretKey),'ciphertext must not expose the secret');
 const opened=vault._test.open(sealed);assert.deepEqual(opened,payload);
 const tampered={...sealed,data:sealed.data.slice(0,-2)+'AA'};assert.equal(vault._test.open(tampered),null,'tampering must fail authentication');
 assert.equal(vault._test.SERVICE_KEYS.resend,'integration-resend');
 assert.equal(vault._test.SERVICE_KEYS.tpvsol,'integration-tpvsol');
 if(previous===undefined)delete process.env.CONFIG_VAULT_KEY;else process.env.CONFIG_VAULT_KEY=previous;
}

function testOwnerEscalation(){
 const {paymentPrivilegeIncrease,integrationPrivilegeIncrease,hasValidShipping}=require('../netlify/functions/admin-settings')._test;
 const base={payment:{managed:true,enabled:true,environment:'test',commerceLive:false}};
 assert.equal(paymentPrivilegeIncrease(base,{payment:{managed:true,enabled:true,environment:'production',commerceLive:false}}),true,'test→production must require owner');
 assert.equal(paymentPrivilegeIncrease(base,{payment:{managed:true,enabled:true,environment:'test',commerceLive:true}}),true,'commerceLive false→true must require owner');
 assert.equal(paymentPrivilegeIncrease({payment:{managed:true,enabled:true,environment:'production',commerceLive:true}},{payment:{managed:true,enabled:true,environment:'test',commerceLive:false}}),false,'risk-reducing disable must remain possible');
 assert.equal(integrationPrivilegeIncrease({integrations:{email:{managed:false,enabled:false},tpvsol:{managed:false,enabled:false,validated:false}}},{integrations:{email:{managed:true,enabled:true},tpvsol:{managed:false,enabled:false,validated:false}}}),true,'enabling managed outbound email must require owner');
 assert.equal(integrationPrivilegeIncrease({integrations:{tpvsol:{managed:true,enabled:true,validated:false}}},{integrations:{tpvsol:{managed:true,enabled:true,validated:true}}}),true,'declaring TPVsol validation must require owner');
 assert.equal(hasValidShipping({managed:true,enabled:true,rateCents:null,methods:[{enabled:true,rateCents:450}]}),true,'managed shipping may be backed by a zone rate');
}

function hasEnvWrite(source,name){const re=new RegExp(`process\\.env\\.${name}\\s*=(?!=)`);return re.test(source)}
function testWiring(){
 const admin=fs.readFileSync('netlify/functions/admin-settings.js','utf8');
 const publicConfig=fs.readFileSync('netlify/functions/site-config.js','utf8');
 const runtime=fs.readFileSync('runtime-content.js','utf8');
 const shipping=fs.readFileSync('netlify/lib/shipping.js','utf8');
 const paymentConfig=fs.readFileSync('netlify/lib/payment-config.js','utf8');
 const integrations=fs.readFileSync('netlify/lib/integration-config.js','utf8');
 const email=fs.readFileSync('netlify/lib/email.js','utf8');
 const vault=fs.readFileSync('netlify/lib/config-vault.js','utf8');
 const checkout=fs.readFileSync('netlify/lib/checkout-enterprise-core.js','utf8');
 const notify=fs.readFileSync('netlify/functions/redsys-notify.js','utf8');
 const refund=fs.readFileSync('netlify/functions/refund-redsys.js','utf8');
 const status=fs.readFileSync('netlify/functions/site-status.js','utf8');
 const tpv=fs.readFileSync('netlify/functions/tpvsol-status.js','utf8');
 const smoke=fs.readFileSync('.github/workflows/production-smoke.yml','utf8');
 const certification=fs.readFileSync('.github/workflows/final-production-certification.yml','utf8');
 const html=fs.readFileSync('settings.html','utf8');
 const ui=fs.readFileSync('settings.js','utf8');
 assert(admin.includes("staff.role!=='owner'")&&admin.includes('paymentPrivilegeIncrease')&&admin.includes('integrationPrivilegeIncrease'),'sensitive escalation must be owner-controlled');
 assert(admin.includes("save-integration-secret")&&admin.includes("clear-integration-secret"),'admin endpoint must support encrypted integration secret lifecycle');
 assert(!publicConfig.includes('secretKey:'),'public config must never serialize secretKey');
 assert(!publicConfig.includes('merchantCode:'),'public config must never serialize merchantCode');
 assert(runtime.includes('ntManagedNavigation')&&runtime.includes('nutretium:site-config'),'storefront must consume managed config');
 assert(!shipping.includes('paymentConfig.applyRuntime'),'shipping must not mutate payment runtime state');
 assert(shipping.includes('matchingMethod')&&shipping.includes('postalPrefixes'),'shipping must consume managed zone rates');
 assert(!hasEnvWrite(paymentConfig,'REDSYS_ENV')&&!hasEnvWrite(paymentConfig,'REDSYS_SECRET_KEY')&&!hasEnvWrite(paymentConfig,'REDSYS_MERCHANT_CODE'),'payment config must not mutate process.env');
 assert(!vault.includes('JWT_SECRET'),'config vault must never reuse JWT_SECRET');
 assert(integrations.includes("vault.readSecret('resend')")&&integrations.includes("vault.readSecret('tpvsol')"),'integration runtime must resolve encrypted secrets');
 assert(email.includes('integrationConfig.email()')&&!email.includes('process.env.RESEND_API_KEY'),'email sender must consume managed integration config');
 assert(tpv.includes('integrationConfig.tpvsol()')&&!tpv.includes('tpvState(process.env);'),'TPV status must consume managed integration config');
 assert(checkout.includes('paymentConfig.resolve()')&&!checkout.includes('process.env.REDSYS_SECRET_KEY'),'checkout must consume immutable payment config');
 assert(notify.includes('paymentConfig.resolve()')&&!notify.includes('paymentConfig.applyRuntime'),'Redsys callback must consume immutable config');
 assert(refund.includes('paymentConfig.resolve()')&&!refund.includes('paymentConfig.applyRuntime'),'refund flow must consume immutable config');
 assert(status.includes('storefrontReady')&&status.includes('commerceReady')&&status.includes('managedIntegrationStates'),'production status must include managed integration readiness');
 assert(smoke.includes('REQUIRE_COMMERCE_LIVE_SMOKE')&&smoke.includes('storefrontReady'),'production smoke must not fail solely because commerce is intentionally off');
 assert(!certification.includes('secrets.RESEND_API_KEY')&&!certification.includes('secrets.TPVSOL_SYNC_TOKEN'),'certification must not duplicate managed operational secrets in GitHub');
 assert(certification.includes('s.integrations?.email?.ready')&&certification.includes('s.integrations?.tpvsol?.ready'),'certification must consume runtime readiness');
 assert(html.includes('type="password"')&&html.includes('paymentSecretKey')&&html.includes('resendApiKey')&&html.includes('tpvToken'),'admin panel must mask all operational secrets');
 assert(html.includes('navigationItems')&&html.includes('shippingMethods')&&html.includes('paymentManaged')&&html.includes('emailManaged')&&html.includes('tpvManaged'),'admin panel must expose managed business configuration');
 assert(ui.includes('x-nutretium-request'),'settings mutations must carry anti-replay request IDs');
}

testNormalization();testVaultCrypto();testOwnerEscalation();testWiring();
console.log('[admin-site-config] OK · panel operativo, bóveda multi-integración, zonas de envío y runtime administrado verificados');
