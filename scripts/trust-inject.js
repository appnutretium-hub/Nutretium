'use strict';

const fs = require('fs');
const path = require('path');

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

// Correcciones estáticas para evitar flash de claims antiguos antes de ejecutar JS.
html = html
  .replaceAll('Lun – Sáb 09:00 – 21:00', 'Lun – Sáb 09:30 – 22:00')
  .replaceAll('Lunes – Sábado: 09:00 – 21:00', 'Lunes – Sábado: 09:30 – 22:00')
  .replaceAll('633 653 517', '633 753 517')
  .replaceAll('Envío express 48h · Devolución gratuita 30 días', 'Tienda física en Santander · Atención personalizada');

fs.writeFileSync(file, html, 'utf8');
console.log('[trust-inject] capas de confianza/comercio inyectadas');