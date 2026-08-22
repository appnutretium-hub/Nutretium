/**
 * netlify/functions/redsys.js — NUTRETIUM
 *
 * Serverless function that generates a signed Redsys payment request.
 *
 * IMPORTE: lo calcula el servidor, nunca el navegador. La petición solo dice qué
 * productos (por id) y cuántas unidades; los precios salen del catálogo a través
 * de ../lib/catalogo.js. Si el total que trae la petición no coincide con el del
 * catálogo, se devuelve 409 y no se firma nada.
 *
 * Redsys HMAC-SHA256v1 signature flow:
 *   1. Build the Ds_MerchantParameters JSON object.
 *   2. Base64-encode it (standard, not URL-safe).
 *   3. Derive a per-order key: 3DES-encrypt the order number with the secret key.
 *   4. HMAC-SHA256 the Base64 string using the derived key.
 *   5. Base64-encode the resulting HMAC → Ds_Signature.
 *
 * Environment variables required (set in Netlify dashboard or .env):
 *   REDSYS_SECRET_KEY    — Your Redsys secret key (e.g. "sq7HjrUOBfKmC576ILgskD5srU870gJ7")
 *   REDSYS_MERCHANT_CODE — Your merchant FUC code (e.g. "999008881")
 *   REDSYS_TERMINAL      — Terminal number (e.g. "1")
 *   URL_OK               — Redirect URL on successful payment
 *   URL_KO               — Redirect URL on failed payment
 *   MERCHANT_URL         — Notification URL (Redsys server-to-server callback)
 *   REDSYS_ENV           — "test" or "production" (defaults to "test")
 */

'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore }   = require('../lib/blob-store');
const { verifyJWT }      = require('../lib/jwt');
const { valorarCarrito } = require('../lib/catalogo');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const REDSYS_URLS = {
  test: 'https://sis-t.redsys.es:25443/sis/realizarPago',
  production: 'https://sis.redsys.es/sis/realizarPago',
};

const SIGNATURE_VERSION = 'HMAC_SHA256_V1';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Genera el nº de pedido para Redsys.
 *
 * Redsys exige: 4–12 caracteres, los 4 primeros numéricos, resto alfanumérico,
 * y ÚNICO por comercio (un repetido lo rechaza con SIS0051).
 *
 * Formato: MMDD + 8 caracteres aleatorios [0-9A-Z] = 12.
 * Los 8 aleatorios salen de crypto.randomBytes: 36^8 ≈ 2,8 billones de combinaciones,
 * así que dos pedidos simultáneos no chocan y el número no se puede adivinar
 * (redsys-status responde a quien acierte un nº de pedido).
 */
const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateOrderNumber() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const prefijo = pad(now.getMonth() + 1) + pad(now.getDate()); // 4 dígitos

  // Rechazo por módulo: descarta los bytes del tramo incompleto (256 % 36 = 4)
  // para que las 36 letras salgan con la misma probabilidad.
  const limite = 256 - (256 % ALFABETO.length);
  let sufijo = '';
  while (sufijo.length < 8) {
    for (const b of crypto.randomBytes(16)) {
      if (b >= limite) continue;
      sufijo += ALFABETO[b % ALFABETO.length];
      if (sufijo.length === 8) break;
    }
  }
  return prefijo + sufijo;
}

/**
 * Derives the per-order signing key using 3DES (CBC, zero IV).
 * @param {string} secretKeyBase64 - Redsys secret key in Base64
 * @param {string} orderNumber     - The order number string
 * @returns {Buffer}
 */
function deriveSigningKey(secretKeyBase64, orderNumber) {
  const keyBuffer = Buffer.from(secretKeyBase64, 'base64');
  const iv = Buffer.alloc(8, 0); // 8-byte zero IV for 3DES-CBC
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
  cipher.setAutoPadding(false);

  // Pad order number to a multiple of 8 bytes with null bytes
  const orderBuffer = Buffer.alloc(
    Math.ceil(orderNumber.length / 8) * 8,
    0
  );
  orderBuffer.write(orderNumber, 'utf8');

  return Buffer.concat([cipher.update(orderBuffer), cipher.final()]);
}

/**
 * Computes the Redsys HMAC-SHA256 signature.
 * @param {string} merchantParametersBase64 - The Base64-encoded parameters string
 * @param {Buffer} signingKey               - Derived per-order key
 * @returns {string} Base64-encoded signature
 */
function computeSignature(merchantParametersBase64, signingKey) {
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(merchantParametersBase64);
  return hmac.digest('base64');
}

// ─── CORS HEADERS ─────────────────────────────────────────────────────────────

const CORS_HEADERS = cabecerasCORS('POST, OPTIONS');

// ─── HANDLER ──────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  // ── Parse request body ──────────────────────────────────────────────────────
  let requestBody;
  try {
    requestBody = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { amount, items, token } = requestBody;

  // ── Poner precio al pedido ─────────────────────────────────────────────────
  // El importe NO se acepta del navegador: se calcula aquí con los precios del
  // catálogo. `items` solo aporta qué producto (id) y cuántas unidades.
  const pedido = valorarCarrito(items);
  if (!pedido.ok) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: pedido.errores[0], detalles: pedido.errores }),
    };
  }

  // El `amount` que manda el navegador solo sirve para detectar desajustes: si
  // no coincide con el del catálogo es que la página tiene precios viejos (o
  // que alguien ha manipulado la petición). En ninguno de los dos casos se cobra.
  if (amount !== undefined && amount !== null) {
    const enviado = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(enviado) || enviado !== pedido.totalCents) {
      console.warn(
        '[Redsys] Importe descartado. Navegador:', enviado,
        'céntimos | Catálogo:', pedido.totalCents, 'céntimos'
      );
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'Los precios del carrito han cambiado. Recarga la página y vuelve a intentarlo.',
          totalCorrecto: pedido.totalCents / 100,
        }),
      };
    }
  }

  // ── Read configuration from environment ────────────────────────────────────
  // Las credenciales NO tienen valor por defecto: si faltan, se aborta.
  // Configúralas en Netlify → Site settings → Environment variables.
  const secretKey    = process.env.REDSYS_SECRET_KEY;
  const merchantCode = process.env.REDSYS_MERCHANT_CODE;
  const terminal     = process.env.REDSYS_TERMINAL || '1';
  const env          = process.env.REDSYS_ENV      || 'test';

  if (!secretKey || !merchantCode) {
    // Log de diagnóstico: solo indica QUÉ falta, nunca los valores.
    const faltan = [
      !secretKey    && 'REDSYS_SECRET_KEY',
      !merchantCode && 'REDSYS_MERCHANT_CODE',
    ].filter(Boolean);
    console.error(
      '[Redsys] Variables de entorno ausentes:', faltan.join(', '),
      '| Vistas por la función:',
      Object.keys(process.env).filter(k => k.startsWith('REDSYS_')).join(', ') || '(ninguna REDSYS_*)'
    );
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Pasarela de pago no configurada.' }),
    };
  }

  // URLs de retorno/notificación: si no se fijan por env, se derivan del host
  // de la petición (así no quedan placeholders "your-site" en el código).
  const host        = event.headers['x-forwarded-host'] || event.headers.host || '';
  const base        = host ? `https://${host}` : '';
  // El navegador vuelve por POST → lo recibe una función que redirige (303) a
  // "/?pago=ok|ko". El resultado real lo confirma redsys-notify (MerchantURL).
  const urlOk       = process.env.URL_OK       || `${base}/.netlify/functions/pago-return?result=ok`;
  const urlKo       = process.env.URL_KO       || `${base}/.netlify/functions/pago-return?result=ko`;
  const merchantUrl = process.env.MERCHANT_URL || `${base}/.netlify/functions/redsys-notify`;

  const redsysUrl = REDSYS_URLS[env] || REDSYS_URLS.test;

  // ── Build Redsys parameters ─────────────────────────────────────────────────
  const orderNumber = generateOrderNumber();
  const amountCents = String(pedido.totalCents);

  const merchantParameters = {
    Ds_Merchant_Amount:          amountCents,
    Ds_Merchant_Order:           orderNumber,
    Ds_Merchant_MerchantCode:    merchantCode,
    Ds_Merchant_Currency:        '978',   // EUR
    Ds_Merchant_TransactionType: '0',     // Standard authorisation
    Ds_Merchant_Terminal:        terminal,
    Ds_Merchant_MerchantURL:     merchantUrl,
    Ds_Merchant_UrlOK:           urlOk,
    Ds_Merchant_UrlKO:           urlKo,
  };

  // ── Encode parameters ───────────────────────────────────────────────────────
  const parametersJson   = JSON.stringify(merchantParameters);
  const parametersBase64 = Buffer.from(parametersJson).toString('base64');

  // ── Generate signature ──────────────────────────────────────────────────────
  let signature;
  try {
    const signingKey = deriveSigningKey(secretKey, orderNumber);
    signature = computeSignature(parametersBase64, signingKey);
  } catch (err) {
    console.error('[Redsys] Signature generation error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Signature generation failed' }),
    };
  }

  // ── Registrar el pedido como PENDIENTE ─────────────────────────────────────
  // Se guarda ANTES de ir a la pasarela para poder asociarlo al usuario y
  // conservar los artículos: la notificación de Redsys no incluye nada de eso,
  // solo el importe y el resultado.
  try {
    // El email sale del token firmado, nunca de lo que envíe el navegador.
    let email = null;
    if (token) {
      try { email = verifyJWT(token).email || null; }
      catch { email = null; } // sesión caducada → pedido de invitado
    }

    const store = getBlobStore('redsys-orders');
    if (store) {
      await store.setJSON(orderNumber, {
        order:     orderNumber,
        email,
        // Líneas valoradas por el servidor, no las que mandó el navegador.
        items:     pedido.lineas,
        amount:    pedido.totalCents / 100,
        currency:  '978',
        status:    'PENDING',
        createdAt: new Date().toISOString(),
      });

      // Índice por usuario, para poder listar "Mis pedidos" sin recorrer todo.
      if (email) {
        const index = getBlobStore('user-orders');
        if (index) {
          const previos = (await index.get(email, { type: 'json' }).catch(() => null)) || [];
          const lista = [orderNumber, ...previos.filter(o => o !== orderNumber)].slice(0, 100);
          await index.setJSON(email, lista);
        }
      }
    }
  } catch (err) {
    // Un fallo aquí no debe impedir el pago: la notificación firmada creará
    // igualmente el registro, solo que sin usuario ni artículos.
    console.error('[Redsys] No se pudo registrar el pedido', orderNumber, err);
  }

  // ── Return payload to frontend ──────────────────────────────────────────────
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      Ds_SignatureVersion:   SIGNATURE_VERSION,
      Ds_MerchantParameters: parametersBase64,
      Ds_Signature:          signature,
      redsysUrl,
      // Nº de pedido, para que el frontend pueda consultar después su estado
      // real en redsys-status (no es un dato sensible: solo es la clave).
      order: orderNumber,
    }),
  };
};
