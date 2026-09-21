'use strict';
const config=require('./payment-config');
const flags=require('./feature-flags');
const providers=new Map();
function register(name,adapter){if(!name||!adapter||typeof adapter.resolve!=='function')throw new TypeError('Adaptador de pago inválido.');providers.set(String(name),adapter);}
register('redsys',{resolve:config.resolve,publicStatus:config.publicStatus});
async function resolve(){flags.requireEnabled('payments');const selected=String(process.env.PAYMENT_PROVIDER||'redsys').toLowerCase();const provider=providers.get(selected);if(!provider){const e=new Error(`Proveedor de pago no soportado: ${selected}`);e.code='PAYMENT_PROVIDER_UNSUPPORTED';e.statusCode=503;throw e;}return provider.resolve();}
async function publicStatus(){const selected=String(process.env.PAYMENT_PROVIDER||'redsys').toLowerCase();if(!flags.enabled('payments'))return{enabled:false,ready:false,provider:selected,reason:'kill-switch'};const provider=providers.get(selected);if(!provider)return{enabled:false,ready:false,provider:selected,reason:'unsupported'};return provider.publicStatus();}
module.exports={register,resolve,publicStatus,_test:{providers}};
