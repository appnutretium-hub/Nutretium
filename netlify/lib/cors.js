/**
 * netlify/lib/cors.js — NUTRETIUM
 *
 * Cabeceras CORS de las funciones.
 *
 * Antes todas respondían `Access-Control-Allow-Origin: *`, es decir: cualquier
 * página de internet podía llamar a la API de la tienda desde el navegador de
 * un visitante (registrar cuentas, iniciar pagos, listar pedidos con un token
 * robado). La web solo se llama a sí misma, así que no hace ninguna falta.
 *
 * El origen permitido sale de la variable URL que Netlify inyecta en las
 * funciones (la dirección del sitio). Las peticiones del mismo origen no pasan
 * por CORS, así que la tienda sigue funcionando igual; lo que deja de funcionar
 * es que la llame otro dominio.
 *
 * ALLOWED_ORIGIN permite forzar otro valor (dominio propio, staging…).
 */

'use strict';

function origenPermitido() {
  const explicito = process.env.ALLOWED_ORIGIN;
  if (explicito) return explicito.replace(/\/+$/, '');

  // URL es la dirección del sitio; DEPLOY_PRIME_URL, la del deploy preview.
  const deNetlify = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (deNetlify) return deNetlify.replace(/\/+$/, '');

  // En local con `netlify dev` no hay ninguna de las dos.
  return 'http://localhost:8888';
}

/**
 * @param {string} metodos p. ej. 'POST, OPTIONS'
 * @returns {object} cabeceras para las respuestas JSON de la función
 */
function cabecerasCORS(metodos) {
  return {
    'Access-Control-Allow-Origin':  origenPermitido(),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': metodos,
    'Vary':                         'Origin',
    'Content-Type':                 'application/json',
  };
}

module.exports = { cabecerasCORS, origenPermitido };
