'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { NUTRETIUM_PRODUCTS = [], NUTRETIUM_CATEGORIES = [] } = require('../products-data.js');
const pim = require('../product-pim.js');

const root = process.cwd();
const active = NUTRETIUM_PRODUCTS.filter(p => p && p.active !== false);
assert(active.length > 0, 'Debe existir catálogo activo');

for (const raw of active) {
  const p = pim.normalize(raw);
  assert(p.slug, `Producto ${raw.id} sin slug`);
  assert(p.sku || raw.code || raw.id, `Producto ${raw.id} sin identificador trazable`);
  if (p.gtin) assert([8,12,13,14].includes(p.gtin.length), `GTIN inválido en ${p.name}`);
  assert(!/undefined|null/i.test(pim.factualDescription(p)), `Descripción factual rota en ${p.name}`);
}

const invalid = pim.normalize({ id:999, name:'Prueba', ean:'12345', active:true });
assert.strictEqual(invalid.gtin, null, 'Un EAN de longitud inválida no debe publicarse como GTIN');

const first = pim.normalize(active[0]);
const productPage = path.join(root,'producto',`${pim.slugify(first.name)}-${first.id}`,'index.html');
assert(fs.existsSync(productPage), 'Debe generarse HTML estático de producto');
const productHtml = fs.readFileSync(productPage,'utf8');
assert(productHtml.includes(`<h1 class="title">${first.name.replace(/&/g,'&amp;')}`) || productHtml.includes(first.name), 'La ficha estática debe contener el producto');
assert(productHtml.includes('rel="canonical"'), 'La ficha estática debe tener canonical');
assert(productHtml.includes('"@type":"Product"'), 'La ficha estática debe tener Product schema');
assert(productHtml.includes('"@type":"BreadcrumbList"'), 'La ficha estática debe tener BreadcrumbList');

const category = NUTRETIUM_CATEGORIES.find(c => active.some(p => p.category === c));
assert(category, 'Debe existir una categoría activa');
const categoryPage = path.join(root,'categoria',pim.slugify(category),'index.html');
assert(fs.existsSync(categoryPage), 'Debe generarse landing estática de categoría');
const categoryHtml = fs.readFileSync(categoryPage,'utf8');
assert(categoryHtml.includes('"@type":"CollectionPage"'), 'La categoría debe tener CollectionPage schema');
assert(categoryHtml.includes('"@type":"ItemList"'), 'La categoría debe tener ItemList schema');

const brands = [...new Set(active.map(p=>p.brand).filter(Boolean))];
if (brands.length) assert(fs.existsSync(path.join(root,'marca',pim.slugify(brands[0]),'index.html')), 'Debe generarse landing de marca');

const sitemap = fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
assert(sitemap.includes(`/producto/${pim.slugify(first.name)}-${first.id}`), 'Sitemap debe incluir productos');
assert(sitemap.includes(`/categoria/${pim.slugify(category)}`), 'Sitemap debe incluir categorías');
const robots = fs.readFileSync(path.join(root,'robots.txt'),'utf8');
assert(robots.includes('Sitemap: https://nutretium.com/sitemap.xml'), 'robots.txt debe declarar sitemap');

const netlify = fs.readFileSync(path.join(root,'netlify.toml'),'utf8');
assert(!netlify.includes('from = "/categoria/*"'), 'No debe reescribirse categoría a la home');
assert(!netlify.includes('from = "/producto/*"'), 'No debe reescribirse producto al shell genérico');

const audit = pim.audit(active);
assert.strictEqual(audit.active, active.length, 'Auditoría PIM debe cubrir todo el catálogo activo');
console.log(`[test-pim-seo] OK · ${audit.active} activos · ${audit.withSku} SKU · ${audit.withGtin} GTIN verificados · ${audit.withImage} con imagen`);
