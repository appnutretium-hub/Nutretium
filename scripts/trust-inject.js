'use strict';

const fs = require('fs');
const path = require('path');
const { NUTRETIUM_PRODUCTS = [], NUTRETIUM_CATEGORIES = [] } = require('../products-data.js');

const file = path.join(process.cwd(), 'index.html');
let html = fs.readFileSync(file, 'utf8');
const marker = '  <script src="animations.js"></script>';
if (!html.includes(marker)) throw new Error('No se encontró el punto seguro de inyección en index.html');

const scripts = [
  'trust-fixes.js','commerce-pro.js','final-hardening.js','commerce-suite.js','commercial-finish.js','compare-suite.js','pro-qa-fixes.js','production-finish.js','mobile-commerce-pro.js','runtime-content.js','runtime-performance.js','runtime-guard.js',
];
for (const src of scripts) if (!html.includes(`src="${src}"`)) html = html.replace(marker, `  <script src="${src}"></script>\n${marker}`);
if (!html.includes('href="runtime-guard.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="runtime-guard.css">\n</head>');

html = html
  .replaceAll('Lun – Sáb 09:00 – 21:00', 'Lun – Sáb 09:30 – 22:00')
  .replaceAll('Lunes – Sábado: 09:00 – 21:00', 'Lunes – Sábado: 09:30 – 22:00')
  .replaceAll('633 653 517', '633 753 517')
  .replaceAll('Envío express 48h · Devolución gratuita 30 días', 'Tienda física en Santander · Atención personalizada')
  .replaceAll('Envío a península gratis a partir de 50€', 'Compra online y atención desde Santander')
  .replaceAll('10% de descuento en tu primer pedido', 'Crea tu cuenta para guardar pedidos y favoritos')
  .replaceAll('Formulaciones avanzadas para atletas que no aceptan compromisos.', 'Suplementación deportiva, alimentación saludable y atención cercana desde nuestra tienda física en Santander.')
  .replaceAll('Opiniones verificadas de compradores reales.', 'Opiniones publicadas tras revisión.')
  .replaceAll('Trabaja con profesionales certificados y consigue resultados reales con un acompañamiento 100% personalizado.', 'Solicita información sobre entrenamiento y el equipo te confirmará disponibilidad, alcance y condiciones del servicio.')
  .replaceAll('Planes nutricionales adaptados a tus metas, gustos y alergias.', 'Información sobre hábitos y objetivos dentro del alcance del profesional que preste el servicio.')
  .replaceAll('Primera evaluación gratuita · Respuesta en menos de 24 h', 'El equipo confirmará disponibilidad y condiciones del servicio.')
  .replaceAll('Pide online y recoge en tienda en minutos. Batidos recién preparados, snacks proteicos y productos listos para llevar, sin esperas ni colas.', 'Consulta directamente con Nutretium la carta y disponibilidad actual de productos preparados.')
  .replaceAll('Pedido listo en 15 minutos', 'Disponibilidad sujeta a confirmación')
  .replaceAll('Paga online o al recoger', 'Condiciones de pago según el pedido confirmado')
  .replaceAll('Pago 100% seguro · Cifrado SSL · Redsys', 'Pago con tarjeta mediante Redsys')
  .replaceAll('Ingredientes de grado farmacéutico', 'Catálogo de nutrición deportiva y alimentación saludable')
  .replaceAll('Sin aditivos artificiales innecesarios', 'Consulta ingredientes y alérgenos en la ficha y etiquetado de cada producto')
  .replaceAll('Testado por terceros (Informed Sport)', 'Información de producto basada en la documentación disponible')
  .replaceAll('Pago 100% seguro con Redsys', 'Pago con tarjeta mediante Redsys')
  .replaceAll('>ISO</p>', '>CATÁLOGO</p>')
  .replaceAll('Certificación 22000', 'Información de producto')
  .replaceAll('>GMP</p>', '>FICHAS</p>')
  .replaceAll('Buenas prácticas', 'Datos y etiquetado')
  .replaceAll('>SSL</p>', '>REDSYS</p>')
  .replaceAll('Pago cifrado', 'Pasarela bancaria')
  .replaceAll('>30d</p>', '>AYUDA</p>')
  .replaceAll('Garantía total', 'Atención y soporte');

const localBusiness = {
  '@context':'https://schema.org','@type':'SportingGoodsStore',name:'Nutretium',url:'https://nutretium.com/',telephone:'+34633753517',
  address:{'@type':'PostalAddress',streetAddress:'Calle La Albericia 1',addressLocality:'Santander',addressRegion:'Cantabria',addressCountry:'ES'},
  openingHoursSpecification:[{'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],opens:'09:30',closes:'22:00'}]
};
if (!html.includes('"@type":"SportingGoodsStore"')) html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(localBusiness)}</script>\n</head>`);
fs.writeFileSync(file, html, 'utf8');

const slugify = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const urls = new Set(['https://nutretium.com/','https://nutretium.com/ayuda','https://nutretium.com/aprende','https://nutretium.com/recomendador']);
NUTRETIUM_CATEGORIES.forEach(c => urls.add(`https://nutretium.com/categoria/${slugify(c)}`));
NUTRETIUM_PRODUCTS.filter(p => p.active !== false).forEach(p => urls.add(`https://nutretium.com/producto/${slugify(p.name)}-${p.id}`));
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((u,i)=>`  <url><loc>${u}</loc><changefreq>${i===0?'daily':'weekly'}</changefreq><priority>${i===0?'1.0':'0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(process.cwd(),'sitemap.xml'), xml, 'utf8');
console.log(`[trust-inject] comercio + contenido editable + rendimiento + runtime guard · sitemap ${urls.size} URLs`);
