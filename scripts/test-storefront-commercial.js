'use strict';

const fs = require('fs');
const assert = require('assert');

const home = fs.readFileSync('index.html', 'utf8');
const commercial = fs.readFileSync('commercial-finish.js', 'utf8');
const css = fs.readFileSync('commercial-finish.css', 'utf8');

const forbidden = [
  ['horario antiguo', '09:00 – 21:00'],
  ['teléfono antiguo', '633 653 517'],
  ['cifra de clientes no documentada', '+5.000'],
  ['claim clientes activos', 'Clientes activos'],
  ['claim calidad absoluta', '100%'],
  ['claim calidad certificada', 'Calidad certificada'],
  ['claim envío 48h', 'Envío express 48h'],
  ['claim devolución 30 días', 'Devolución gratuita 30 días'],
  ['claim temporada genérico', 'Nueva temporada 2026'],
  ['promo primer pedido no validada', '10% de descuento en tu primer pedido'],
  ['vídeo de stock Coverr', 'cdn.coverr.co'],
  ['poster de stock Unsplash', 'images.unsplash.com/photo-1534438327276-14e5300c3a48'],
];

for (const [label, needle] of forbidden) {
  assert(!home.includes(needle), `El build conserva ${label}: ${needle}`);
}

assert(home.includes('09:30 – 22:00'), 'El horario validado 09:30–22:00 no aparece en el build.');
assert(home.includes('633 753 517'), 'El teléfono comercial esperado no aparece en el build.');
assert(home.includes('Santander · Tienda física + online'), 'Falta el posicionamiento local verificable del hero.');
assert(home.includes('Nutretium | Nutrición deportiva y alimentación saludable en Santander'), 'Falta el title SEO comercial esperado.');
assert(/<meta\s+name="description"\s+content="[^"]*Santander/i.test(home), 'Falta meta description local y descriptiva.');
assert(home.includes('"@type":"SportingGoodsStore"'), 'Falta LocalBusiness/SportingGoodsStore JSON-LD.');
assert(home.includes('Calle La Albericia 1'), 'El schema local no contiene la dirección de tienda.');

assert(commercial.includes('installPredictiveSearch'), 'La búsqueda predictiva comercial no está instalada.');
assert(commercial.includes("role','combobox'"), 'La búsqueda predictiva no declara el patrón accesible combobox.');
assert(commercial.includes('replaceGenericSportsMedia'), 'No existe la sustitución segura del material deportivo genérico.');
assert(commercial.includes('enhanceProductCards'), 'No existe el refuerzo accesible/rendimiento de tarjetas de producto.');
assert(css.includes('.nt-search-suggest'), 'Falta el diseño de resultados predictivos.');
assert(css.includes('.nt-local-proof'), 'Falta el bloque visual de prueba local.');

console.log('[storefront-commercial] copy verificable + SEO local + búsqueda + media + accesibilidad: OK');
