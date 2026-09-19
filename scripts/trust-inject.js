'use strict';

const fs = require('fs');
const path = require('path');
const { NUTRETIUM_PRODUCTS = [], NUTRETIUM_CATEGORIES = [] } = require('../products-data.js');

const file = path.join(process.cwd(), 'index.html');
let html = fs.readFileSync(file, 'utf8');
const marker = '  <script src="animations.js"></script>';
if (!html.includes(marker)) throw new Error('No se encontró el punto seguro de inyección en index.html');

const scripts = [
  'trust-fixes.js',
  'commerce-pro.js',
  'final-hardening.js',
  'commerce-suite.js',
  'commercial-finish.js',
];

for (const src of scripts) {
  if (!html.includes(`src="${src}"`)) {
    html = html.replace(marker, `  <script src="${src}"></script>\n${marker}`);
  }
}

// Correcciones estáticas: los buscadores y clientes sin JS no deben recibir claims antiguos.
html = html
  .replaceAll('Lun – Sáb 09:00 – 21:00', 'Lun – Sáb 09:30 – 22:00')
  .replaceAll('Lunes – Sábado: 09:00 – 21:00', 'Lunes – Sábado: 09:30 – 22:00')
  .replaceAll('633 653 517', '633 753 517')
  .replaceAll('Envío express 48h · Devolución gratuita 30 días', 'Tienda física en Santander · Atención personalizada')
  .replaceAll('Envío a península gratis a partir de 50€', 'Compra online y atención desde Santander')
  .replaceAll('10% de descuento en tu primer pedido', 'Crea tu cuenta para guardar pedidos y favoritos')
  .replaceAll('Formulaciones avanzadas para atletas que no aceptan compromisos.', 'Suplementación deportiva, alimentación saludable y atención cercana desde nuestra tienda física en Santander.')
  .replaceAll('Opiniones verificadas de compradores reales.', 'Opiniones publicadas tras revisión.');

// Datos estructurados del establecimiento, solo con información operativa conocida.
const localBusiness = {
  '@context':'https://schema.org',
  '@type':'SportingGoodsStore',
  name:'Nutretium',
  url:'https://nutretium.com/',
  telephone:'+34633753517',
  address:{
    '@type':'PostalAddress',
    streetAddress:'Calle La Albericia 1',
    addressLocality:'Santander',
    addressRegion:'Cantabria',
    postalCode:'39012',
    addressCountry:'ES'
  },
  openingHoursSpecification:[{
    '@type':'OpeningHoursSpecification',
    dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    opens:'09:30',
    closes:'22:00'
  }]
};
if (!html.includes('"@type":"SportingGoodsStore"')) {
  html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(localBusiness)}</script>\n</head>`);
}

fs.writeFileSync(file, html, 'utf8');

// Sitemap completo generado desde la misma fuente de verdad que usa el servidor.
const slugify = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const urls = new Set([
  'https://nutretium.com/',
  'https://nutretium.com/ayuda',
  'https://nutretium.com/aprende',
  'https://nutretium.com/recomendador',
]);
NUTRETIUM_CATEGORIES.forEach(c => urls.add(`https://nutretium.com/categoria/${slugify(c)}`));
NUTRETIUM_PRODUCTS.filter(p => p.active !== false).forEach(p => urls.add(`https://nutretium.com/producto/${slugify(p.name)}-${p.id}`));
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((u,i)=>`  <url><loc>${u}</loc><changefreq>${i===0?'daily':'weekly'}</changefreq><priority>${i===0?'1.0':'0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(process.cwd(),'sitemap.xml'), xml, 'utf8');
console.log(`[trust-inject] capas de confianza/comercio inyectadas · sitemap ${urls.size} URLs`);
