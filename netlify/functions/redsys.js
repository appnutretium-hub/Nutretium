'use strict';

/**
 * Endpoint heredado desactivado de forma deliberada.
 *
 * El único flujo autorizado para iniciar cobros es:
 *   POST /.netlify/functions/checkout
 *
 * Mantener este archivo evita que URLs antiguas produzcan un 404 ambiguo, pero
 * nunca genera firmas, importes ni operaciones de Redsys. Así no pueden coexistir
 * dos fuentes de verdad de checkout.
 */
exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }
  return {
    statusCode: 410,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      error: 'Endpoint retirado. Utiliza el checkout actual.',
      checkout: '/checkout',
    }),
  };
};
