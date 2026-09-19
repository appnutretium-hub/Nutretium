'use strict';

const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');
const { exigePermiso } = require('../lib/staff');

const CORS = cabecerasCORS('POST, OPTIONS');
const ESTADOS = new Set([
  'PENDING_FULFILMENT',
  'PREPARING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REVIEW_REQUIRED',
]);

function json(statusCode, payload) {
  return { statusCode, headers: CORS, body: JSON.stringify(payload) };
}

function normalizaTexto(valor, max = 160) {
  return String(valor || '').trim().slice(0, max);
}

function publico(rec) {
  return {
    order: rec.order,
    status: rec.status || 'PENDING',
    fulfilmentStatus: rec.fulfilmentStatus || null,
    amount: Number(rec.amount || 0),
    currency: rec.currency || '978',
    email: rec.email || '',
    cliente: rec.cliente || '',
    telefono: rec.telefono || '',
    envio: rec.envio || null,
    items: Array.isArray(rec.items) ? rec.items : [],
    createdAt: rec.createdAt || null,
    receivedAt: rec.receivedAt || null,
    authCode: rec.authCode || null,
    amountMismatch: rec.amountMismatch || null,
    tracking: rec.tracking || null,
    internalNote: rec.internalNote || '',
    updatedAt: rec.updatedAt || null,
    updatedBy: rec.updatedBy || null,
  };
}

async function cargaPedidos(store) {
  const listado = await store.list();
  const claves = (listado.blobs || []).map(b => b.key).slice(0, 1000);
  const registros = await Promise.all(
    claves.map(key => store.get(key, { type: 'json' }).catch(() => null))
  );
  return registros
    .filter(Boolean)
    .map(publico)
    .sort((a, b) => String(b.createdAt || b.receivedAt || '').localeCompare(String(a.createdAt || a.receivedAt || '')));
}

function metricas(pedidos) {
  const pagados = pedidos.filter(p => p.status === 'PAID');
  const ventas = pagados.reduce((s, p) => s + Number(p.amount || 0), 0);
  const ticketMedio = pagados.length ? ventas / pagados.length : 0;
  const pendientes = pagados.filter(p => !['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(p.fulfilmentStatus)).length;
  const incidencias = pedidos.filter(p => p.amountMismatch || p.fulfilmentStatus === 'REVIEW_REQUIRED').length;
  const clientes = new Set(pedidos.map(p => String(p.email || '').toLowerCase()).filter(Boolean)).size;
  return { ventas, pagados: pagados.length, ticketMedio, pendientes, incidencias, clientes, totalPedidos: pedidos.length };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON no válido.' }); }

  const permiso = body.action === 'update-fulfilment' ? 'shipping' : 'orders';
  const staff = exigePermiso(event, permiso);
  if (!staff.ok) return json(staff.statusCode, { error: staff.error });

  const store = getBlobStore('redsys-orders');
  if (!store) return json(503, { error: 'Almacenamiento de pedidos no disponible.' });

  if (body.action === 'list') {
    const pedidos = await cargaPedidos(store);
    return json(200, { pedidos, metricas: metricas(pedidos), operador: staff.email, permisos: staff.permisos });
  }

  if (body.action === 'update-fulfilment') {
    const order = normalizaTexto(body.order, 32);
    const fulfilmentStatus = normalizaTexto(body.fulfilmentStatus, 40);
    if (!order) return json(400, { error: 'Falta el número de pedido.' });
    if (!ESTADOS.has(fulfilmentStatus)) return json(400, { error: 'Estado logístico no permitido.' });

    const rec = await store.get(order, { type: 'json' }).catch(() => null);
    if (!rec) return json(404, { error: 'Pedido no encontrado.' });
    if (rec.status !== 'PAID' && !['REVIEW_REQUIRED', 'CANCELLED'].includes(fulfilmentStatus)) {
      return json(409, { error: 'No se puede avanzar la logística de un pedido cuyo pago no está confirmado.' });
    }

    const tracking = body.tracking && typeof body.tracking === 'object' ? {
      carrier: normalizaTexto(body.tracking.carrier, 80),
      code: normalizaTexto(body.tracking.code, 120),
      url: normalizaTexto(body.tracking.url, 500),
    } : (rec.tracking || null);

    const actualizado = {
      ...rec,
      fulfilmentStatus,
      tracking,
      internalNote: normalizaTexto(body.internalNote ?? rec.internalNote, 500),
      updatedAt: new Date().toISOString(),
      updatedBy: staff.email,
    };

    await store.setJSON(order, actualizado);
    return json(200, { ok: true, pedido: publico(actualizado) });
  }

  return json(400, { error: 'Acción no reconocida.' });
};