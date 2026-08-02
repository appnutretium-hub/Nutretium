/**
 * netlify/functions/pago-return.js — NUTRETIUM
 *
 * URLs de vuelta del navegador tras el pago (Ds_Merchant_UrlOK / UrlKO).
 *
 * Redsys devuelve el navegador aquí mediante un POST que incluye la respuesta
 * FIRMADA (Ds_MerchantParameters + Ds_Signature). Verificamos esa firma en el
 * servidor con la clave secreta: una firma HMAC válida no se puede falsificar,
 * así que el resultado es de fiar (no es "fiarse del redirect a secas").
 *
 * Con la firma validada, redirigimos por GET a:
 *   /?pago=ok|ko&order=XXXX&estado=PAID|FAILED
 *
 * Así la confirmación funciona aunque la notificación servidor-a-servidor
 * (redsys-notify) se retrase o su almacenamiento no esté disponible.
 * redsys-notify sigue siendo el registro autoritativo del pedido.
 */

'use strict';

const crypto = require('crypto');

// ─── CRIPTOGRAFÍA (misma que redsys.js / redsys-notify.js) ────────────────────

function deriveSigningKey(secretKeyBase64, orderNumber) {
  const keyBuffer = Buffer.from(secretKeyBase64, 'base64');
  const iv = Buffer.alloc(8, 0);
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
  cipher.setAutoPadding(false);

  const orderBuffer = Buffer.alloc(Math.ceil(orderNumber.length / 8) * 8, 0);
  orderBuffer.write(orderNumber, 'utf8');

  return Buffer.concat([cipher.update(orderBuffer), cipher.final()]);
}

function toBase64Url(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ─── LECTURA DEL POST DE REDSYS ───────────────────────────────────────────────

function parseForm(event) {
  const raw = event.body || '';
  const decoded = event.isBase64Encoded
    ? Buffer.from(raw, 'base64').toString('utf8')
    : raw;

  const p = new URLSearchParams(decoded);
  return {
    merchantParameters: p.get('Ds_MerchantParameters'),
    signature:          p.get('Ds_Signature'),
  };
}

/**
 * Devuelve { order, estado } a partir del POST de Redsys.
 * `estado` solo se rellena si la firma es VÁLIDA; si no, queda null y la
 * página caerá en la consulta contra redsys-status.
 */
function verifyReturn(event) {
  try {
    const { merchantParameters, signature } = parseForm(event);
    if (!merchantParameters || !signature) return { order: null, estado: null };

    const json = JSON.parse(Buffer.from(merchantParameters, 'base64').toString('utf8'));
    const order = json.Ds_Order || json.DS_ORDER || null;
    if (!order || !/^[0-9A-Za-z]{4,12}$/.test(order)) return { order: null, estado: null };

    const secret = process.env.REDSYS_SECRET_KEY;
    if (!secret) return { order, estado: null };

    const computed = crypto
      .createHmac('sha256', deriveSigningKey(secret, order))
      .update(merchantParameters)
      .digest('base64');

    if (!safeEqual(toBase64Url(computed), toBase64Url(signature))) {
      console.warn('[pago-return] Firma inválida en la vuelta del pedido', order);
      return { order, estado: null };
    }

    // Ds_Response 0000–0099 = autorizada.
    const code = parseInt(json.Ds_Response, 10);
    const estado = Number.isInteger(code) && code >= 0 && code <= 99 ? 'PAID' : 'FAILED';

    console.log('[pago-return]', JSON.stringify({ order, estado, code: json.Ds_Response }));
    return { order, estado };
  } catch (err) {
    console.error('[pago-return] Error procesando la vuelta:', err);
    return { order: null, estado: null };
  }
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  const result = (event.queryStringParameters || {}).result === 'ok' ? 'ok' : 'ko';
  const { order, estado } = verifyReturn(event);

  const params = new URLSearchParams({ pago: result });
  if (order)  params.set('order', order);
  if (estado) params.set('estado', estado);

  return {
    statusCode: 303,
    headers: {
      Location: `/?${params.toString()}`,
      'Cache-Control': 'no-store',
    },
    body: '',
  };
};
