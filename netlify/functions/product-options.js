'use strict';

const store = require('../lib/enterprise-store');
const { NUTRETIUM_PRODUCTS } = require('../../products-data.js');

const response = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300', 'Access-Control-Allow-Origin': 'https://nutretium.com', Vary: 'Origin' }, body: JSON.stringify(body) });

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return response(405, { error: 'Method Not Allowed' });
  const productId = Number(event.queryStringParameters?.productId);
  const product = (NUTRETIUM_PRODUCTS || []).find(item => Number(item.id) === productId && item.active !== false);
  if (!product) return response(404, { error: 'Producto no encontrado.' });
  try {
    const [variants, media] = await Promise.all([store.list('product-variants', { limit: 1000 }), store.list('media', { limit: 1000 })]);
    const safeVariants = variants.filter(item => Number(item.productId) === productId && item.status === 'active' && !item.archivedAt).map(item => ({ sku: item.sku, name: item.name || item.label || item.flavour || item.size || item.sku, flavour: item.flavour || null, size: item.size || null, priceCents: Number.isInteger(Number(item.priceCents)) ? Number(item.priceCents) : null, imageUrl: /^\/|^https:\/\//.test(String(item.imageUrl || '')) ? item.imageUrl : null, available: item.available !== false }));
    const safeMedia = media.filter(item => Number(item.productId) === productId && item.status === 'active' && ['image', 'video'].includes(item.kind) && !item.archivedAt).map(item => ({ kind: item.kind, url: /^\/|^https:\/\//.test(String(item.url || '')) ? item.url : null, alt: item.alt || product.name, position: Number(item.position || 0) })).filter(item => item.url).sort((a, b) => a.position - b.position).slice(0, 8);
    return response(200, { productId, variants: safeVariants, media: safeMedia });
  } catch { return response(200, { productId, variants: [], media: [] }); }
};
