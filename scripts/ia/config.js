// IA reparadora — valores fijos. Un solo sitio para los topes y los tiempos:
// las pruebas los sobrescriben por opción, no copiándolos.
'use strict';

const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const MINUTO = 60 * 1000;

// Las suites que protegen el cobro, el catálogo y las cuentas van primero.
const COMPROBACIONES = [
  'test', 'test:redsys', 'test:catalogo', 'test:admin', 'test:cuentas',
  'test:commerce', 'test:security', 'test:passwords', 'test:pim',
  'test:customer', 'test:admin-security', 'test:release-guards',
  'test:contracts', 'test:smart-store',
];

module.exports = {
  RAIZ,
  MINUTO,
  COMPROBACIONES,
  INTENTOS_POR_RONDA: 3,
  INTENTOS_MAXIMOS: 6,            // por error, sumando sesiones: después queda «sin resolver»
  TIEMPO_PRUEBA_MS: 6 * MINUTO,
  TIEMPO_OLLAMA_MS: 10 * MINUTO,
  REPASO_MS: 30 * MINUTO,         // con todo en verde, cada cuánto se repasan las pruebas
  ESPERA_OLLAMA_MS: 30 * 1000,    // primera espera si Ollama no está; se dobla hasta 5 min
  ESPERA_OLLAMA_MAX_MS: 5 * MINUTO,
  MAX_CAMBIOS: 5,
  MAX_TEXTO_CAMBIO: 6000,
  MAX_ARCHIVO_PROMPT: 9000,
  MAX_REVISION_BYTES: 80 * 1024,
  MAX_PREVIOS: 6,                 // intentos fallidos que se le recuerdan al implementador
  // Lo que no se copia al espacio aparte: pesa y ninguna prueba lo lee.
  NO_COPIAR: new Set(['node_modules', '.git', 'dist', '.netlify', '.ia-reparador', '.claude', 'playwright-report', 'test-results']),
};
