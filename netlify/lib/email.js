/**
 * netlify/lib/email.js — NUTRETIUM
 *
 * Envío de correo mediante la API de Resend (https://resend.com).
 * Netlify no ofrece servicio de correo, por eso hace falta un proveedor.
 *
 * Variables de entorno:
 *   RESEND_API_KEY            — clave de API de Resend (obligatoria para enviar)
 *   ORDER_NOTIFICATION_EMAIL  — dirección que recibe los avisos de pedido
 *   ORDER_EMAIL_FROM          — remitente. Sin dominio verificado en Resend
 *                               debe ser "onboarding@resend.dev"; con
 *                               nutretium.com verificado, "pedidos@nutretium.com"
 *
 * Si falta RESEND_API_KEY no se envía nada y se deja constancia en el log:
 * el envío de correo NUNCA debe tumbar el procesamiento de un pago.
 */

'use strict';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Envía un correo. Devuelve true si se envió, false si no.
 * No lanza nunca: quien llama no debe verse afectado por un fallo de correo.
 */
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.ORDER_EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    console.warn('[email] TODO: falta RESEND_API_KEY; no se envia correo. Asunto:', subject);
    return false;
  }
  if (!to) {
    console.warn('[email] Sin destinatario; no se envia. Asunto:', subject);
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      console.error('[email] Resend devolvio', res.status, detalle.slice(0, 300));
      return false;
    }

    console.log('[email] Enviado:', subject, '->', to);
    return true;
  } catch (err) {
    console.error('[email] Error de red al enviar:', err);
    return false;
  }
}

/** Escapa texto para incrustarlo en el HTML del correo. */
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Construye el aviso de pedido pagado que recibe la tienda. */
function buildOrderEmail(record) {
  const filas = (record.items || []).length
    ? record.items.map(i => `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #eee;">${esc(i.name)} &times;${esc(i.qty)}</td>
          <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
            ${(Number(i.price) * Number(i.qty)).toFixed(2)} &euro;
          </td>
        </tr>`).join('')
    : '<tr><td colspan="2" style="padding:6px 0;color:#888;">Sin detalle de art&iacute;culos.</td></tr>';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
      <h2 style="margin:0 0 4px;">Nuevo pedido pagado</h2>
      <p style="margin:0 0 18px;color:#666;font-size:14px;">Pedido ${esc(record.order)}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${filas}
        <tr>
          <td style="padding:10px 0;font-weight:bold;">Total</td>
          <td style="padding:10px 0;text-align:right;font-weight:bold;">
            ${Number(record.amount || 0).toFixed(2)} &euro;
          </td>
        </tr>
      </table>

      <p style="font-size:14px;line-height:1.6;margin-top:18px;">
        <strong>Cliente:</strong> ${esc(record.email || 'Compra sin cuenta (invitado)')}<br/>
        <strong>Autorizaci&oacute;n:</strong> ${esc(record.authCode || '—')}<br/>
        <strong>Fecha:</strong> ${esc(record.receivedAt || record.createdAt || '')}
      </p>
    </div>`;

  return {
    subject: `Nuevo pedido ${record.order} — ${Number(record.amount || 0).toFixed(2)} €`,
    html,
  };
}

module.exports = { sendEmail, buildOrderEmail };
