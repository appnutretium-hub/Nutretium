// Entorno mínimo para las pruebas. Se carga en la primera línea de la prueba,
// antes de cualquier require del proyecto.
//
// Motivo: con las variables del sitio de Netlify puestas (COMMERCE_LIVE, URL,
// REQUIRE_PRODUCT_COMPLIANCE…) fallaban pruebas que están bien, y un fallo de
// entorno tapa los fallos de verdad. Se deja la misma lista mínima que usa la
// IA reparadora (sin secretos) y cada prueba pone después lo que necesita.
'use strict';

const { entornoLimpio } = require('./ia/procesos');

const limpio = entornoLimpio(process.env);
for (const k of Object.keys(process.env)) if (!(k in limpio)) delete process.env[k];
Object.assign(process.env, limpio);
