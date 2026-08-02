/**
 * netlify/functions/diag.js — TEMPORAL · BORRAR TRAS DIAGNOSTICAR
 *
 * GET /.netlify/functions/diag
 *
 * Sirve para comprobar si las variables de entorno de Redsys llegan a las
 * funciones. NO expone ningún valor: solo si existen y su longitud (útil para
 * detectar comillas o espacios pegados por error al copiar).
 *
 * >>> Elimina este archivo en cuanto el pago funcione. <<<
 */

'use strict';

/** Comprueba que @netlify/blobs esté instalado y operativo (escribe y lee). */
async function checkBlobs() {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('redsys-orders');
    await store.setJSON('__diag__', { ok: true, ts: Date.now() });
    const back = await store.get('__diag__', { type: 'json' });
    await store.delete('__diag__');
    return { disponible: true, lecturaEscritura: !!(back && back.ok) };
  } catch (err) {
    return { disponible: false, error: String(err && err.message || err) };
  }
}

exports.handler = async function () {
  const info = k => {
    const v = process.env[k];
    if (v === undefined) return { presente: false };
    return {
      presente: true,
      longitud: v.length,
      // Avisos típicos al pegar valores en el panel:
      espaciosSobrantes: v !== v.trim(),
      llevaComillas: /^["']|["']$/.test(v),
    };
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      aviso: 'Endpoint temporal de diagnostico. Borrar tras usarlo.',
      contextoDespliegue: process.env.CONTEXT || null,   // production / deploy-preview / branch-deploy
      sitio:              process.env.SITE_NAME || null,
      variables: {
        REDSYS_SECRET_KEY:    info('REDSYS_SECRET_KEY'),
        REDSYS_MERCHANT_CODE: info('REDSYS_MERCHANT_CODE'),
        REDSYS_TERMINAL:      info('REDSYS_TERMINAL'),
        REDSYS_ENV:           info('REDSYS_ENV'),
      },
      // Nombres (no valores) de cualquier variable REDSYS_* que vea la funcion.
      // Si aparece vacio, ninguna esta llegando: problema de scope o de sitio.
      clavesRedsysVisibles: Object.keys(process.env).filter(k => k.startsWith('REDSYS_')),
      // Si "disponible" es false, redsys-notify no puede guardar el resultado
      // y el pago se quedara siempre en "Pago en verificacion".
      blobs: await checkBlobs(),
      // Diagnostico del runtime: NOMBRES de variables (nunca valores).
      // NETLIFY_BLOBS_CONTEXT es la que inyecta Netlify para configurar Blobs
      // automaticamente; si no aparece, el runtime no la esta proporcionando.
      runtime: {
        tieneBlobsContext: !!process.env.NETLIFY_BLOBS_CONTEXT,
        tieneSiteId:       !!process.env.SITE_ID,
        versionBlobs:      (() => {
          try { return require('@netlify/blobs/package.json').version; }
          catch { return 'no instalado'; }
        })(),
        nodeVersion: process.version,
        varsNetlify: Object.keys(process.env)
          .filter(k => /^(NETLIFY|SITE|DEPLOY|AWS_LAMBDA)/.test(k))
          .sort(),
      },
    }, null, 2),
  };
};
