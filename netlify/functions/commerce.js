'use strict';

const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');
const { verifyJWT, tokenFromHeader, secretConfigured } = require('../lib/jwt');
const promotions = require('../lib/promotions');

const CORS = cabecerasCORS('GET, POST, OPTIONS');
const POINTS_CONFIGURED = String(process.env.NUTRETIUM_POINTS_PER_EURO || '').trim() !== '';
const POINTS_PER_EURO = POINTS_CONFIGURED ? Math.max(0, Number(process.env.NUTRETIUM_POINTS_PER_EURO)) : 0;

function json(statusCode, payload) {
  return { statusCode, headers:CORS, body:JSON.stringify(payload) };
}

function emailFrom(event) {
  if (!secretConfigured()) return null;
  const token = tokenFromHeader(event.headers || {});
  if (!token) return null;
  try { return verifyJWT(token).email || null; } catch { return null; }
}

async function pedidosDe(email) {
  const index = getBlobStore('user-orders');
  const orders = getBlobStore('redsys-orders');
  if (!index || !orders) return [];
  const ids = (await index.get(email, {type:'json'}).catch(()=>null)) || [];
  const rows = await Promise.all(ids.slice(0,100).map(id => orders.get(id,{type:'json'}).catch(()=>null)));
  return rows.filter(r => r && r.email === email);
}

function resumenPedidos(rows) {
  const paid = rows.filter(r => r.status === 'PAID' && !r.amountMismatch);
  const spent = paid.reduce((s,r)=>s+Number(r.amount||0),0);
  const points = POINTS_CONFIGURED ? Math.floor(spent * POINTS_PER_EURO) : 0;
  const productCounts = new Map();
  paid.forEach(r => (r.items||[]).forEach(i => {
    const key = String(i.code || i.id || i.name || '');
    if (!key) return;
    const prev = productCounts.get(key) || { key, name:i.name || key, qty:0, last:null };
    prev.qty += Number(i.qty||0);
    prev.last = r.receivedAt || r.createdAt || prev.last;
    productCounts.set(key,prev);
  }));
  return {
    orders: paid.length,
    spent: Number(spent.toFixed(2)),
    points,
    pointsEnabled: POINTS_CONFIGURED && POINTS_PER_EURO > 0,
    pointsPerEuro: POINTS_CONFIGURED ? POINTS_PER_EURO : null,
    frequentProducts: [...productCounts.values()].sort((a,b)=>b.qty-a.qty).slice(0,8),
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return {statusCode:204,headers:CORS,body:''};

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400,{error:'JSON no válido.'}); }

    if (body.action === 'coupon') {
      const subtotalCents = Math.max(0, Math.round(Number(body.subtotalCents)||0));
      const result = promotions.calcula(subtotalCents, body.code);
      return json(result.ok ? 200 : 422, result);
    }
    return json(400,{error:'Acción no reconocida.'});
  }

  if (event.httpMethod === 'GET') {
    const email = emailFrom(event);
    if (!email) return json(401,{error:'Debes iniciar sesión.'});
    const rows = await pedidosDe(email);
    return json(200,{ summary:resumenPedidos(rows) });
  }

  return json(405,{error:'Method Not Allowed'});
};
