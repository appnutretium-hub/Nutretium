'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const requiredFiles = [
  'index.html','app.js','products-data.js','styles.css','trust-fixes.js',
  'franchise-trust.js','commerce-pro.js','final-hardening.js','producto.html','producto.js','ayuda.html','netlify.toml'
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

  const netlify = read('netlify.toml');
  if (!netlify.includes('from = "/producto/*"')) failures.push('Falta ruta limpia /producto/*');
  if (!netlify.includes('from = "/categoria/*"')) failures.push('Falta ruta limpia /categoria/*');
  if (!netlify.includes('from = "/ayuda"')) failures.push('Falta ruta /ayuda');

  const commerce = read('commerce-pro.js');
  ['installCartPersistence','insertCatalogToolbar','installSearchSuggestions','installGroundedChat'].forEach(fn => {
    if (!commerce.includes(fn)) failures.push(`Commerce Pro incompleto: ${fn}`);
  });

  const product = read('producto.js');
  if (!product.includes('window.NUTRETIUM_PRODUCTS')) failures.push('Ficha producto no usa catálogo real');
  if (!product.includes('product.active') && !product.includes('filter(p => p.active !== false)')) failures.push('Ficha producto no filtra productos retirados');
}

if (failures.length) {
  console.error('\n[smoke-web] FALLO');
  failures.forEach(f => console.error(' - ' + f));
  process.exit(1);
}

console.log('[smoke-web] OK — archivos, scripts, rutas y elementos críticos presentes');
