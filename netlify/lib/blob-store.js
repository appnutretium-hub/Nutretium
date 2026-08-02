/**
 * netlify/lib/blob-store.js — NUTRETIUM
 *
 * Acceso centralizado a Netlify Blobs.
 *
 * El runtime de funciones de este sitio NO inyecta NETLIFY_BLOBS_CONTEXT, así
 * que getStore('nombre') no puede autoconfigurarse y falla con:
 *   "The environment has not been configured to use Netlify Blobs"
 *
 * Por eso pasamos las credenciales explícitamente:
 *   SITE_ID           — la inyecta Netlify automáticamente
 *   NETLIFY_API_TOKEN — Personal Access Token, en variables de entorno del sitio
 *
 * Si algún día Netlify empieza a inyectar el contexto, el modo automático
 * sigue funcionando como respaldo sin tocar nada.
 *
 * Vive fuera de netlify/functions/ a propósito: cualquier .js dentro de esa
 * carpeta se publicaría como un endpoint.
 */

'use strict';

/**
 * Devuelve un store de Blobs listo para usar, o null si no está disponible
 * (por ejemplo en desarrollo local sin `netlify dev`). Quien llame debe
 * comprobar el null y degradar con elegancia.
 *
 * @param {string} name Nombre del store (p. ej. "users", "redsys-orders")
 * @returns {object|null}
 */
function getBlobStore(name) {
  try {
    const { getStore } = require('@netlify/blobs');
    const siteID = process.env.SITE_ID;
    const token  = process.env.NETLIFY_API_TOKEN;

    if (siteID && token) return getStore({ name, siteID, token });
    return getStore(name);
  } catch {
    return null;
  }
}

module.exports = { getBlobStore };
