'use strict';
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const forbidden=[
 'Envío a península gratis a partir de 50€',
 '10% de descuento en tu primer pedido',
 'Pedido listo en 15 minutos',
 'Paga online o al recoger',
 'Envío express 48h · Devolución gratuita 30 días',
 'Opiniones verificadas de compradores reales.',
 'Ingredientes de grado farmacéutico',
 'Sin aditivos artificiales innecesarios',
 'Informed Sport',
 'Pago 100% seguro',
 'Certificación 22000',
 '>ISO</p>',
 '>GMP</p>',
 'Garantía total'
];
const hits=forbidden.filter(x=>html.includes(x));
if(hits.length){console.error('[build-trust-audit] FALLO — claims no documentados en build final');hits.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('[build-trust-audit] OK — no quedan claims comerciales/certificaciones no documentados conocidos en index.html final');