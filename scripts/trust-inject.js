'use strict';

const fs = require('fs');
const path = require('path');
const { NUTRETIUM_PRODUCTS = [], NUTRETIUM_CATEGORIES = [] } = require('../products-data.js');

const file = path.join(process.cwd(), 'index.html');
let html = fs.readFileSync(file, 'utf8');
const marker = '  <script src="animations.js"></script>';
if (!html.includes(marker)) throw new Error('No se encontró el punto seguro de inyección en index.html');

const scripts = [
  'trust-fixes.js','commerce-pro.js','wishlist-sync.js','final-hardening.js','commerce-suite.js','commercial-finish.js','compare-suite.js','smart-store-engine.js','smart-store.js','pro-qa-fixes.js','production-finish.js','mobile-commerce-pro.js','runtime-content.js','runtime-performance.js','site-config-runtime.js','runtime-guard.js',
];
for (const src of scripts) if (!html.includes(`src="${src}"`)) html = html.replace(marker, `  <script src="${src}"></script>\n${marker}`);
if (!html.includes('href="runtime-guard.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="runtime-guard.css">\n</head>');
if (!html.includes('href="smart-store.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="smart-store.css">\n</head>');
if (!html.includes('rel="manifest"')) html = html.replace('</head>', '  <link rel="manifest" href="/manifest.webmanifest">\n  <meta name="theme-color" content="#0a0a0a">\n</head>');
if (!html.includes('type="application/ld+json" href="/.netlify/functions/catalog-json"')) html = html.replace('</head>', '  <link rel="alternate" type="application/ld+json" href="/.netlify/functions/catalog-json" title="Catálogo Nutretium JSON-LD">\n</head>');

html = html
  .replaceAll('Lun – Sáb 09:00 – 21:00', 'Lun – Sáb 09:30 – 22:00')
  .replaceAll('Lun – Sáb &nbsp;09:00 – 21:00', 'Lun – Sáb &nbsp;09:30 – 22:00')
  .replaceAll('Lunes – Sábado: 09:00 – 21:00', 'Lunes – Sábado: 09:30 – 22:00')
  .replaceAll('633 653 517', '633 753 517')
  .replaceAll('Envío express 48h · Devolución gratuita 30 días', 'Tienda física en Santander · Atención personalizada')
  .replaceAll('Envío a península gratis a partir de 50€', 'Compra online y atención desde Santander')
  .replaceAll('10% de descuento en tu primer pedido', 'Crea tu cuenta para guardar pedidos y favoritos')
  .replaceAll('Nueva temporada 2026', 'Santander · Tienda física + online')
  .replaceAll('Formulaciones avanzadas para atletas que no aceptan compromisos.', 'Suplementación deportiva, açaí, smoothies y alimentación saludable desde Santander.')
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
  .replaceAll('Garantía total', 'Atención y soporte')
  .replaceAll('>+5.000</p>', '>Santander</p>')
  .replaceAll('Clientes activos', 'Tienda física · La Albericia')
  .replaceAll('>100%</p>', '>Online</p>')
  .replaceAll('Calidad certificada', 'Catálogo web')
  .replaceAll('>48h</p>', '>Redsys</p>')
  .replaceAll('>30 días</p>', '>Ayuda</p>')
  .replaceAll('Garantía devolución', 'Atención postventa')
  .replaceAll('Compras superiores a <span class="text-brand-gold gold-text">50€</span>', 'Compra online desde <span class="text-brand-gold gold-text">Nutretium</span>')
  .replaceAll('🎁 Regalo gratis &nbsp;o&nbsp; 🚚 Envío gratis a península', 'Explora el catálogo y revisa las condiciones disponibles antes de confirmar tu pedido')
  .replaceAll('Aprovechar oferta', 'Ver catálogo');

// El vídeo de stock externo no debe iniciar descargas ni presentarse como material propio.
// La capa comercial lo sustituye por información real de la tienda al arrancar.
html = html
  .replaceAll('poster="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80"', '')
  .replaceAll('<source src="https://cdn.coverr.co/videos/coverr-a-man-lifting-weights-in-a-gym-4490/1080p.mp4" type="video/mp4"/>', '');

const title = 'Nutretium | Nutrición deportiva y alimentación saludable en Santander';
html = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
const description = 'Nutretium en Santander: suplementación deportiva, açaí, smoothies y alimentación saludable. Explora el catálogo online y consulta al equipo si necesitas ayuda para elegir.';
if (/<meta\s+name=["']description["']/i.test(html)) {
  html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}">`);
} else {
  html = html.replace('</title>', `</title>\n  <meta name="description" content="${description}">`);
}

// Landmark principal: se añade en build para no tocar a mano la Home de gran tamaño.
// Es idempotente porque Netlify y los quality gates pueden ejecutar este script más de una vez.
if (!html.includes('<main id="mainContent"')) {
  const heroMarker = '  <!-- ══════════════════════════════════════════\n       HERO';
  const footerMarker = '  <!-- ══════════════════════════════════════════\n       FOOTER';
  if (!html.includes(heroMarker) || !html.includes(footerMarker)) throw new Error('No se encontraron los límites seguros para el landmark principal.');
  html = html.replace(heroMarker, `  <main id="mainContent">\n\n${heroMarker}`);
  html = html.replace(footerMarker, `  </main>\n\n${footerMarker}`);
}

const localBusiness = {
  '@context':'https://schema.org','@type':'SportingGoodsStore',name:'Nutretium',url:'https://nutretium.com/',telephone:'+34633753517',
  address:{'@type':'PostalAddress',streetAddress:'Calle La Albericia 1',addressLocality:'Santander',addressRegion:'Cantabria',addressCountry:'ES'},
  openingHoursSpecification:[{'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],opens:'09:30',closes:'22:00'}]
};
if (!html.includes('"@type":"SportingGoodsStore"')) html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(localBusiness)}</script>\n</head>`);
fs.writeFileSync(file, html, 'utf8');

function injectStaffBridge(filename, appScript) {
  const target=path.join(process.cwd(),filename);if(!fs.existsSync(target))throw new Error(`Falta ${filename}`);
  let source=fs.readFileSync(target,'utf8');
  if(source.includes('staff-session-bridge.js'))return;
  const needle=`<script src="${appScript}"></script>`;
  if(!source.includes(needle))throw new Error(`No se encontró ${needle} en ${filename}`);
  source=source.replace(needle,`<script src="/staff-session-bridge.js"></script>\n${needle}`);
  fs.writeFileSync(target,source,'utf8');
}
injectStaffBridge('admin.html','admin.js');
injectStaffBridge('backoffice.html','backoffice.js');

const slugify = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const urls = new Set(['https://nutretium.com/','https://nutretium.com/ayuda','https://nutretium.com/aprende','https://nutretium.com/recomendador']);
NUTRETIUM_CATEGORIES.forEach(c => urls.add(`https://nutretium.com/categoria/${slugify(c)}`));
NUTRETIUM_PRODUCTS.filter(p => p.active !== false).forEach(p => urls.add(`https://nutretium.com/producto/${slugify(p.name)}-${p.id}`));
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((u,i)=>`  <url><loc>${u}</loc><changefreq>${i===0?'daily':'weekly'}</changefreq><priority>${i===0?'1.0':'0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(process.cwd(),'sitemap.xml'), xml, 'utf8');
console.log(`[trust-inject] comercio + Smart Store + sesión interna HttpOnly + favoritos + accesibilidad + SEO · sitemap ${urls.size} URLs`);