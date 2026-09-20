'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { tokenFromHeader } = require('../lib/jwt');
const { verifyEventSession } = require('../lib/session');
const { getBlobStore } = require('../lib/blob-store');
const enterprise = require('../lib/enterprise-store');
const { createPdf } = require('../lib/simple-pdf');
const CORS = cabecerasCORS('GET, OPTIONS');
const SYSTEM = { email: 'system@nutretium.local', role: 'system' };

function hash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function safeEqual(a, b) { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function response(statusCode, body) { return { statusCode, headers: { ...CORS, 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }; }
function euro(cents) { return `${(Number(cents || 0) / 100).toFixed(2)} EUR`; }

async function authorizedOrder(event, orderId) {
  const orders = getBlobStore('redsys-orders');
  if (!orders) throw Object.assign(new Error('Pedidos no disponibles.'), { statusCode: 503 });
  const order = await orders.get(orderId, { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!order || order.status !== 'PAID' || order.amountMismatch) throw Object.assign(new Error('Pedido pagado no encontrado.'), { statusCode: 404 });
  const bearer = tokenFromHeader(event.headers || {});
  if (bearer) {
    try {
      const session = await verifyEventSession(event, { requireUser:true });
      if (session.email === String(order.email || '').toLowerCase()) return order;
    } catch {}
  }
  const guest = event.queryStringParameters?.token || '';
  if (order.guest && guest && safeEqual(order.guestAccessHash, hash(guest))) return order;
  throw Object.assign(new Error('No tienes acceso a esta factura.'), { statusCode: 403 });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return response(405, { error: 'Method Not Allowed' });
  try {
    const orderId = String(event.queryStringParameters?.order || '').trim();
    if (!orderId) return response(400, { error: 'Falta el pedido.' });
    const order = await authorizedOrder(event, orderId);
    const tax = order.taxBreakdown;
    if (!Array.isArray(tax) || !tax.length) return response(409, { error: 'La factura fiscal todavía no puede emitirse: falta el desglose tributario validado del pedido.' });
    const id = `invoice:${order.order}`;
    let invoice = await enterprise.get('invoices', id).catch(() => null);
    if (!invoice) {
      const issuedAt = new Date().toISOString();
      invoice = await enterprise.save('invoices', { id, number: `NT-${issuedAt.slice(0, 4)}-${order.order}`, orderId: order.order, customerEmail: order.email || '', currency: 'EUR', status: 'issued', type: 'invoice', amountCents: Math.round(Number(order.amount || 0) * 100), issuedAt, taxBreakdown: tax }, SYSTEM, { id, reason: 'customer-invoice-download' });
    }
    const lines = [`Factura: ${invoice.number || invoice.id}`, `Pedido: ${order.order}`, `Fecha: ${String(invoice.issuedAt || '').slice(0, 10)}`, `Cliente: ${order.cliente || order.email || ''}`, `Total: ${euro(invoice.amountCents)}`, '', 'Impuestos'];
    tax.forEach(row => lines.push(`${row.label || row.rate + '%'}  Base ${euro(row.baseCents)}  Cuota ${euro(row.taxCents)}`));
    lines.push('', 'Productos');
    (order.items || []).forEach(item => lines.push(`${Number(item.qty || 0)} x ${item.name || item.code}  ${euro(Math.round(Number(item.totalLinea || 0) * 100))}`));
    const pdf = createPdf({ title: 'NUTRETIUM - Factura', lines });
    return { statusCode: 200, isBase64Encoded: true, headers: { ...CORS, 'Cache-Control': 'private, no-store', 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Nutretium-${order.order}.pdf"` }, body: pdf.toString('base64') };
  } catch (error) { return response(error.statusCode || 500, { error: error.message }); }
};

exports._test = { hash, safeEqual };