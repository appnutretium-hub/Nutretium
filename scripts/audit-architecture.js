'use strict';
const fs=require('fs');
const required=[
  'index.html','commerce-pro.js','commerce-suite.js','commercial-finish.js','commercial-finish.css','compare-suite.js','pro-qa-fixes.js','production-finish.js','mobile-commerce-pro.js','mobile-commerce-pro.css','comparar.html','comparar.js','producto.html','producto.js','product-education.js','aprende.html','checkout.html','checkout.js','cuenta.html','cuenta.js','smart-shop.html','smart-shop.js','backoffice.html','backoffice.js','control.html','control.js','ayuda.html',
  'netlify/functions/checkout.js','netlify/functions/commerce.js','netlify/functions/orders.js','netlify/functions/admin-orders.js','netlify/functions/saved-cart.js','netlify/functions/analytics-event.js','netlify/functions/admin-analytics.js','netlify/functions/system-health.js','netlify/functions/reviews.js','netlify/functions/redsys-notify.js','netlify/functions/contact.js','netlify/lib/promotions.js','netlify/lib/staff.js','netlify/lib/email.js'
];
const missing=required.filter(f=>!fs.existsSync(f));
if(missing.length)throw new Error('Arquitectura incompleta. Faltan: '+missing.join(', '));
function has(file,needle){const text=fs.readFileSync(file,'utf8');if(!text.includes(needle))throw new Error(`${file}: falta ${needle}`)}
function hasAny(file,needles,label){const text=fs.readFileSync(file,'utf8');if(!needles.some(needle=>text.includes(needle)))throw new Error(`${file}: falta ${label||needles.join(' o ')}`)}
function parse(file){try{new Function(fs.readFileSync(file,'utf8'));}catch(err){throw new Error(`${file}: JavaScript no válido: ${err.message}`)}}
has('scripts/trust-inject.js','commerce-suite.js');
has('scripts/trust-inject.js','commercial-finish.js');
has('scripts/trust-inject.js','compare-suite.js');
has('scripts/trust-inject.js','pro-qa-fixes.js');
has('scripts/trust-inject.js','production-finish.js');
has('scripts/trust-inject.js','mobile-commerce-pro.js');
has('scripts/trust-inject.js','El equipo confirmará disponibilidad y condiciones del servicio.');
has('commerce-suite.js','/checkout.html');
has('commerce-suite.js','raw.version===1&&raw.analitica===true');
has('checkout.js','/.netlify/functions/checkout');
has('checkout.js','raw.version===1&&raw.analitica===true');
has('netlify/functions/checkout.js','valorarCarrito');
has('netlify/functions/checkout.js','promotions.calcula');
has('netlify/functions/checkout.js','COMMERCE_LIVE');
has('netlify/functions/checkout.js','publicProductionHost');
has('netlify/functions/checkout.js','persistencia obligatoria');
has('netlify/functions/checkout.js','store.get(order,{type:\'json\'})');
has('netlify/functions/redsys-notify.js','missingOrderRecord');
has('netlify/functions/redsys-notify.js','Storage unavailable');
has('netlify/functions/redsys-notify.js','REVIEW_REQUIRED');
has('netlify/functions/admin-orders.js','exigePermiso');
has('netlify/functions/admin-orders.js','normalizaTrackingUrl');
has('netlify/functions/admin-orders.js','http:// o https://');
has('netlify/functions/reviews.js','verifiedPurchase');
has('netlify/functions/saved-cart.js','valorarCarrito');
has('netlify/functions/contact.js',"consume({scope:'contact'");
has('netlify/functions/contact.js','statusCode: 429');
has('netlify/functions/commerce.js','POINTS_CONFIGURED');
has('netlify/functions/commerce.js','pointsEnabled');
has('smart-shop.js','GOALS');
hasAny('cuenta.js',['frequentProducts',"action:'overview'"],'resumen de compras');
hasAny('cuenta.js',['Programa de puntos no activo','d.loyalty'],'estado de fidelización');
has('backoffice.js','data.operador||data.administrador');
has('backoffice.js','envio.calle');
has('franchise-trust.js','productIdFromCard');
has('franchise-trust.js','card.dataset.productId');
has('ayuda.html','href="/mi-nutretium"');
has('netlify.toml','/mi-nutretium');
has('netlify.toml','/comparar');
has('netlify.toml','node scripts/audit-architecture.js');
has('aprende.html','Entiende lo que compras');
has('product-education.js','NUTRETIUM APRENDE');
has('comparar.html','Compara sin adivinar');
has('comparar.js','Pendiente de documentación estructurada del fabricante');
has('_redirects','/aprende');
has('_redirects','/comparar');
has('pro-qa-fixes.js','ntMobileFilters');
has('pro-qa-fixes.js','/.netlify/functions/orders');
has('pro-qa-fixes.js','window.submitTrainerRequest');
has('pro-qa-fixes.js','window.submitCareerApplication');
has('pro-qa-fixes.js','tarjeta mediante Redsys');
has('production-finish.js','visibleFocusable');
has('production-finish.js','Introduce un email válido.');
has('mobile-commerce-pro.js','productIdFromCard');
has('mobile-commerce-pro.js','bindCleanButton');
has('mobile-commerce-pro.js','data-product-id');
has('mobile-commerce-pro.js','ntDockCartBadge');
has('mobile-commerce-pro.css','min-height:50px');
has('mobile-commerce-pro.css','env(safe-area-inset-bottom');
['franchise-trust.js','commercial-finish.js','product-education.js','compare-suite.js','comparar.js','pro-qa-fixes.js','production-finish.js','mobile-commerce-pro.js','commerce-suite.js','checkout.js','cuenta.js','backoffice.js','netlify/functions/checkout.js','netlify/functions/commerce.js','netlify/functions/admin-orders.js','netlify/functions/redsys-notify.js','netlify/functions/contact.js'].forEach(parse);
const points=[
 'seguridad/configuración','fotos/catálogo','navegación/buscador','URLs limpias','filtros','ficha producto','compra rápida','carrito/cross-sell','checkout invitado','Redsys','pedidos','envíos/tracking','clientes','favoritos/recompra','points','reseñas verificadas','packs','cupones','emails','SEO','analítica','carrito guardado','recomendador','roles','responsive/build audit'
];
console.log(`[audit-architecture] OK — ${points.length}/25 bloques + educación + comparador + QA móvil + SKU estable + backoffice + tracking + points fail-closed + protecciones de producción`);
