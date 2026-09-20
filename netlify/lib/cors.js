/**
 * netlify/lib/cors.js — NUTRETIUM
 * Restricción de API al origen autorizado.
 */
'use strict';

function origenPermitido() {
  const explicito = process.env.ALLOWED_ORIGIN;
  if (explicito) return explicito.replace(/\/+$/, '');
  const deNetlify = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (deNetlify) return deNetlify.replace(/\/+$/, '');
  return 'http://localhost:8888';
}

function cabecerasCORS(metodos) {
  return {
    'Access-Control-Allow-Origin':  origenPermitido(),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Nutretium-CSRF, X-Nutretium-Request',
    'Access-Control-Allow-Methods': metodos,
    'Vary':                         'Origin',
    'Content-Type':                 'application/json',
  };
}

module.exports = { cabecerasCORS, origenPermitido };
