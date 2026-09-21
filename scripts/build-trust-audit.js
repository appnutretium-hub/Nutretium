'use strict';
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const publicCopy=`${html}\n${app}`;
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
 'Garantía total',
 'Envío gratis',
 'envío gratis',
 '24–48 horas',
 '24-48 horas',
 'Devoluciones gratuitas',
 'devolución gratuita'
];
const hits=forbidden.filter(x=>publicCopy.includes(x));
if(hits.length){console.error('[build-trust-audit] FALLO — claims no documentados en build final');hits.forEach(x=>console.error(' - '+x));process.exit(1)}
if(!app.includes('El pago online disponible es con <strong>tarjeta mediante Redsys</strong>')){console.error('[build-trust-audit] FALLO — el asistente no limita expresamente el pago a Redsys');process.exit(1)}
console.log('[build-trust-audit] OK — copy comercial conocida verificada en index.html y app.js');
