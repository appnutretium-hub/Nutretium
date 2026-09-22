'use strict';

const { connectLambda } = require('@netlify/blobs');

/**
 * Netlify Blobs no inyecta automáticamente el contexto en Functions v1
 * (handlers Lambda `exports.handler`). En producción, Netlify añade el payload
 * `event.blobs`; connectLambda lo traduce al contexto que usa getStore().
 *
 * Los tests locales de Nutretium usan el almacén en memoria y no incluyen
 * `event.blobs`, por lo que en esos entornos este helper es deliberadamente no-op.
 */
function connectBlobs(event) {
  if (process.env.NUTRETIUM_TEST_MEMORY_BLOBS === 'true') return false;
  if (!event || typeof event.blobs !== 'string' || !event.blobs) return false;
  connectLambda(event);
  return true;
}

module.exports = { connectBlobs };
