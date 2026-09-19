'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const requiredFiles = [
  'index.html','app.js','products-data.js','styles.css','trust-fixes.js',
  'franchise-trust.js','commerce-pro.js','final-hardening.js','producto.html','producto.js',
  'product-variants.js','commerce-core.js','ayuda.html','netlify.toml','netlify/functions/redsys-notify.js','netlify/lib/email.js'
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
  if (!productHtml.includes('product-variants.js')) failures.push('producto.html no carga product-variants.js');
  if (!productHtml.includes('producto.js')) failures.push('producto.html no carga producto.js');

  const product = read('producto.js');
  if (!product.includes('window.NUTRETIUM_PRODUCTS')) failures.push('Ficha producto no usa catálogo real');
  if (!/filter\s*\(\s*p\s*=>\s*p\.active\s*!==\s*false\s*\)/.test(product)) failures.push('Ficha producto no filtra retirados');
  if (!(product.includes('variantSelectorHtml') || (product.includes('loadOptions') && product.includes('product-options')))) failures.push('Ficha producto sin selector de variantes');
  if (!(product.includes('qtyInput') || (product.includes('qtyValue') && product.includes('qtyMinus') && product.includes('qtyPlus')))) failures.push('Ficha producto sin selector de cantidad');
  if (!(product.includes('addSelectedToCart') || (product.includes('addButton') && product.includes('/?add=')))) failures.push('Ficha producto sin alta de carrito');
  const commerceCore = read('commerce-core.js');
  if (!(product.includes('CART_KEY') || (commerceCore.includes("params.get('add')") && commerceCore.includes("params.get('qty')")))) failures.push('Ficha producto sin contrato de carrito');

  const variants = read('product-variants.js');
  ['NUTRETIUM_VARIANTS','family(product','factualDescription'].forEach(token => {
    if (!variants.includes(token)) failures.push(`Variantes incompletas: ${token}`);
  });

  const netlify = read('netlify.toml');
  if (!netlify.includes('from = "/producto/*"')) failures.push('Falta ruta limpia /producto/*');
  if (!netlify.includes('from = "/categoria/*"')) failures.push('Falta ruta limpia /categoria/*');
  if (!netlify.includes('from = "/ayuda"')) failures.push('Falta ruta /ayuda');

  const commerce = read('commerce-pro.js');
  ['installCartPersistence','insertCatalogToolbar','installSearchSuggestions','installGroundedChat'].forEach(fn => {
    if (!commerce.includes(fn)) failures.push(`Commerce Pro incompleto: ${fn}`);
  });

  const email = read('netlify/lib/email.js');
  ['buildStoreOrderEmail','buildCustomerOrderEmail','Idempotency-Key'].forEach(token => {
    if (!email.includes(token)) failures.push(`Email transaccional incompleto: ${token}`);
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
