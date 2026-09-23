'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const requiredFiles = [
  'index.html','app.js','products-data.js','styles.css','trust-fixes.js',
  'franchise-trust.js','commerce-pro.js','final-hardening.js','producto.html','producto.js',
  'product-pim.js','product-variants.js','commerce-core.js','ayuda.html','condiciones.html','netlify.toml','netlify/functions/redsys-notify.js','netlify/lib/email.js',
  'sesion-cliente.js','cuenta.html','cuenta.js','checkout.html'
];

const failures = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root,file))) failures.push(`Falta ${file}`);
}
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }

if (!failures.length) {
  const index = read('index.html');
  ['products-data.js','app.js','trust-fixes.js','commerce-pro.js','final-hardening.js','animations.js'].forEach(src => {
    if (!index.includes(`src="${src}"`)) failures.push(`index.html no carga ${src}`);
  });
  if (!index.includes('id="productGrid"')) failures.push('Falta #productGrid');
  if (!index.includes('id="redsysBtn"')) failures.push('Falta botón Redsys');
  if (!index.includes('id="cartItems"')) failures.push('Falta contenedor de carrito');

  const productHtml = read('producto.html');
  if (!productHtml.includes('product-pim.js')) failures.push('producto.html no carga product-pim.js');
  if (!productHtml.includes('product-variants.js')) failures.push('producto.html no carga product-variants.js');
  if (!productHtml.includes('producto.js')) failures.push('producto.html no carga producto.js');
  if (productHtml.indexOf('product-pim.js') > productHtml.indexOf('product-variants.js')) failures.push('producto.html carga product-pim.js demasiado tarde');

  const product = read('producto.js');
  if (!product.includes('window.NUTRETIUM_PRODUCTS')) failures.push('Ficha producto no usa catálogo real');
  if (!/filter\s*\(\s*p\s*=>\s*p\.active\s*!==\s*false\s*\)/.test(product)) failures.push('Ficha producto no filtra retirados');
  if (!(product.includes('variantSelectorHtml') || (product.includes('loadOptions') && product.includes('product-options')))) failures.push('Ficha producto sin selector de variantes');
  if (!(product.includes('qtyInput') || (product.includes('qtyValue') && product.includes('qtyMinus') && product.includes('qtyPlus')))) failures.push('Ficha producto sin selector de cantidad');
  if (!(product.includes('addSelectedToCart') || (product.includes('addButton') && product.includes('/?add=')))) failures.push('Ficha producto sin alta de carrito');
  const commerceCore = read('commerce-core.js');
  if (!(product.includes('CART_KEY') || (commerceCore.includes("params.get('add')") && commerceCore.includes("params.get('qty')")))) failures.push('Ficha producto sin contrato de carrito');

  const variants = read('product-variants.js');
  ['NUTRETIUM_VARIANTS','factualDescription'].forEach(token => {
    if (!variants.includes(token)) failures.push(`Variantes incompletas: ${token}`);
  });
  if (!(variants.includes('family(product') || variants.includes('family: pim.family'))) {
    failures.push('Variantes incompletas: resolución de familia');
  }

  const netlify = read('netlify.toml');
  if (!netlify.includes('from = "/ayuda"')) failures.push('Falta ruta /ayuda');
  if (!netlify.includes('from = "/condiciones"')) failures.push('Falta ruta /condiciones');

  const checkout = read('checkout.js');
  ['termsAccepted','termsVersion','checkoutTerms'].forEach(token => {
    if (!checkout.includes(token)) failures.push(`Checkout sin consentimiento contractual: ${token}`);
  });

  const commerce = read('commerce-pro.js');
  ['installCartPersistence','insertCatalogToolbar','installSearchSuggestions','installGroundedChat'].forEach(fn => {
    if (!commerce.includes(fn)) failures.push(`Commerce Pro incompleto: ${fn}`);
  });

  const email = read('netlify/lib/email.js');
  ['buildStoreOrderEmail','buildCustomerOrderEmail','Idempotency-Key'].forEach(token => {
    if (!email.includes(token)) failures.push(`Email transaccional incompleto: ${token}`);
  });

  // ── Sesión de cliente ───────────────────────────────────────────────────
  // La sesión va en la cookie HttpOnly y el token ya no se guarda en el
  // navegador: quien pregunte por `.token` para saber si hay sesión deja fuera
  // a quien acaba de entrar. Todo eso vive en sesion-cliente.js, así que cada
  // página que lo necesite tiene que cargarlo ANTES que sus scripts.
  const paginasConSesion = {
    'index.html': ['app.js','wishlist-sync.js','commerce-suite.js','commercial-finish.js','pro-qa-fixes.js'],
    'cuenta.html': ['cuenta.js'],
    'producto.html': ['product-engagement.js'],
    'checkout.html': ['checkout.js'],
  };
  // Se busca la etiqueta, no el nombre del archivo: los comentarios del HTML
  // nombran scripts y falsearían el orden.
  const posicionDeScript = (html, src) => {
    const i = html.indexOf(`src="${src}"`), j = html.indexOf(`src="/${src}"`);
    return i >= 0 && j >= 0 ? Math.min(i, j) : Math.max(i, j);
  };
  for (const [pagina, consumidores] of Object.entries(paginasConSesion)) {
    const html = read(pagina);
    const posicion = posicionDeScript(html, 'sesion-cliente.js');
    if (posicion < 0) { failures.push(`${pagina} no carga sesion-cliente.js`); continue; }
    consumidores.forEach(src => {
      const uso = posicionDeScript(html, src);
      if (uso >= 0 && uso < posicion) failures.push(`${pagina} carga ${src} antes de sesion-cliente.js`);
    });
  }
  ['cuenta.js','checkout.js','product-engagement.js','wishlist-sync.js','commerce-account-sync.js','commerce-suite.js','commercial-finish.js','pro-qa-fixes.js','enterprise-storefront.js']
    .forEach(archivo => {
      const codigo = read(archivo);
      // Ni el nombre del almacén: la sesión se pregunta al helper y a nadie más.
      if (codigo.includes('nutretium_user')) failures.push(`${archivo} lee la sesión del almacén del navegador en vez de sesion-cliente.js`);
      // currentUser guarda el perfil, y el perfil nunca lleva token.
      if (/currentUser\??\.token/.test(codigo)) failures.push(`${archivo} decide la sesión por un token que el navegador ya no guarda`);
    });

  const notify = read('netlify/functions/redsys-notify.js');
  ['buildStoreOrderEmail','buildCustomerOrderEmail','PENDING_FULFILMENT','nutretium-order-customer','nutretium-order-store'].forEach(token => {
    if (!notify.includes(token)) failures.push(`Redsys notify incompleto: ${token}`);
  });
}

if (failures.length) {
  console.error('\n[smoke-web] FALLO');
  failures.forEach(f => console.error(' - ' + f));
  process.exit(1);
}
console.log('[smoke-web] OK — compra, variantes, rutas y emails críticos presentes');
