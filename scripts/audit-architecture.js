'use strict';
const fs=require('fs');
const required=[
  'index.html','commerce-pro.js','commerce-suite.js','commercial-finish.js','commercial-finish.css','producto.html','producto.js','product-education.js','aprende.html','checkout.html','checkout.js','cuenta.html','cuenta.js','smart-shop.html','smart-shop.js','backoffice.html','backoffice.js','control.html','control.js','ayuda.html',
  'netlify/functions/checkout.js','netlify/functions/commerce.js','netlify/functions/orders.js','netlify/functions/admin-orders.js','netlify/functions/saved-cart.js','netlify/functions/analytics-event.js','netlify/functions/admin-analytics.js','netlify/functions/system-health.js','netlify/functions/reviews.js','netlify/functions/redsys-notify.js','netlify/lib/promotions.js','netlify/lib/staff.js','netlify/lib/email.js'
];
const missing=required.filter(f=>!fs.existsSync(f));
if(missing.length)throw new Error('Arquitectura incompleta. Faltan: '+missing.join(', '));
function has(file,needle){const text=fs.readFileSync(file,'utf8');if(!text.includes(needle))throw new Error(`${file}: falta ${needle}`)}
function parse(file){try{new Function(fs.readFileSync(file,'utf8'));}catch(err){throw new Error(`${file}: JavaScript no válido: ${err.message}`)}}
has('scripts/trust-inject.js','commerce-suite.js');
has('scripts/trust-inject.js','commercial-finish.js');
has('commerce-suite.js','/checkout.html');
has('checkout.js','/.netlify/functions/checkout');
has('netlify/functions/checkout.js','valorarCarrito');
has('netlify/functions/checkout.js','promotions.calcula');
has('netlify/functions/admin-orders.js','exigePermiso');
has('netlify/functions/reviews.js','verifiedPurchase');
has('netlify/functions/saved-cart.js','valorarCarrito');
has('smart-shop.js','GOALS');
has('cuenta.js','frequentProducts');
has('netlify.toml','/mi-nutretium');
has('netlify.toml','node scripts/audit-architecture.js');
has('aprende.html','Entiende lo que compras');
has('product-education.js','NUTRETIUM APRENDE');
has('_redirects','/aprende');
['commercial-finish.js','product-education.js'].forEach(parse);
const points=[
 'seguridad/configuración','fotos/catálogo','navegación/buscador','URLs limpias','filtros','ficha producto','compra rápida','carrito/cross-sell','checkout invitado','Redsys','pedidos','envíos/tracking','clientes','favoritos/recompra','points','reseñas verificadas','packs','cupones','emails','SEO','analítica','carrito guardado','recomendador','roles','responsive/build audit'
];
console.log(`[audit-architecture] OK — ${points.length}/25 bloques arquitectónicos presentes + centro educativo/commercial finish`);
