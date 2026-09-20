'use strict';

const fs=require('fs');
const file='index.html';
let html=fs.readFileSync(file,'utf8');

html=html.replace(/<title>[^<]*<\/title>/i,'<title>Nutretium | Nutrición deportiva y alimentación saludable en Santander</title>');
if(!/<meta\s+name="description"/i.test(html)){
  html=html.replace('</title>','</title>\n  <meta name="description" content="Nutretium en Santander: suplementación deportiva, açaí, smoothies y alimentación saludable. Compra online y atención desde nuestra tienda física." />');
}
if(!html.includes('"@type":"SportingGoodsStore"')){
  const schema='\n  <script type="application/ld+json">{"@context":"https://schema.org","@type":"SportingGoodsStore","name":"Nutretium","url":"https://nutretium.com/","address":{"@type":"PostalAddress","streetAddress":"Calle La Albericia 1","addressLocality":"Santander","addressRegion":"Cantabria","postalCode":"39012","addressCountry":"ES"},"telephone":"+34633753517"}</script>';
  html=html.replace('</head>',schema+'\n</head>');
}

html=html.replace(/09:00\s*[–-]\s*21:00/g,'09:30 – 22:00');
html=html.replace(/Nueva temporada 2026/g,'Santander · Tienda física + online');
html=html.replace(/Formulaciones avanzadas para atletas que no aceptan compromisos\./g,'Suplementación deportiva, açaí, smoothies y alimentación saludable desde Santander.');
html=html.replace(/Envío express 48h\s*·\s*Devolución gratuita 30 días/g,'Santander · Tienda física + online');
html=html.replace(/🚚 Envío a península gratis a partir de 50€[\s\S]*?¡Regístrate ahora!<\/button>/,'Compra online y atención desde Santander <span class="hidden xs:inline mx-2 opacity-50">|</span> <span class="block xs:inline">Crea tu cuenta para guardar pedidos y favoritos</span>');

const stats=/<div id="statsBar"[\s\S]*?<\/div>\s*<\/div>\s*\n\s*<!-- ══════════════════════════════════════════\n       CATEGORIES/;
if(stats.test(html)){
  html=html.replace(stats,`<div id="statsBar" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 stats-grid grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
      <div class="py-1"><p class="text-xl sm:text-2xl font-black text-brand-gold">Santander</p><p class="text-xs text-brand-muted uppercase tracking-wider mt-1">Tienda física · La Albericia</p></div>
      <div class="py-1"><p class="text-xl sm:text-2xl font-black text-brand-gold">Online</p><p class="text-xs text-brand-muted uppercase tracking-wider mt-1">Catálogo y compra desde la web</p></div>
      <div class="py-1"><p class="text-xl sm:text-2xl font-black text-brand-gold">Redsys</p><p class="text-xs text-brand-muted uppercase tracking-wider mt-1">Pasarela bancaria</p></div>
      <div class="py-1"><p class="text-xl sm:text-2xl font-black text-brand-gold">Ayuda</p><p class="text-xs text-brand-muted uppercase tracking-wider mt-1">Atención antes y después</p></div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════
       CATEGORIES`);
}

html=html.replace(/<video[\s\S]*?<\/video>/i,`<div class="w-full h-full flex items-center justify-center p-8 bg-gradient-to-br from-black via-[#15120a] to-black" role="img" aria-label="Nutretium Santander, tienda física y online">
        <div class="text-center max-w-2xl"><p class="text-brand-gold text-xs font-bold uppercase tracking-widest">NUTRETIUM · SANTANDER</p><p class="text-white text-2xl sm:text-4xl font-black mt-3">Tienda física + compra online</p><p class="text-brand-muted mt-3">C/ La Albericia 1 · Suplementación deportiva, açaí, smoothies y alimentación saludable.</p></div>
      </div>`);

const forbidden=['09:00 – 21:00','+5.000','Clientes activos','>100%</p>','Calidad certificada','Envío express 48h','Devolución gratuita 30 días','Nueva temporada 2026','10% de descuento en tu primer pedido','cdn.coverr.co','images.unsplash.com/photo-1534438327276-14e5300c3a48'];
for(const value of forbidden){if(html.includes(value))throw new Error(`Permanece copy prohibido: ${value}`);}
if(!html.includes('09:30 – 22:00'))throw new Error('Falta el horario validado.');
if(!html.includes('633 753 517'))throw new Error('Falta el teléfono validado.');
if(!/<main\b/i.test(html))throw new Error('Falta landmark main.');
if(!html.includes('"@type":"SportingGoodsStore"'))throw new Error('Falta schema local.');

fs.writeFileSync(file,html,'utf8');
console.log('[normalize-storefront-contract] storefront alineado con contrato verificable');
