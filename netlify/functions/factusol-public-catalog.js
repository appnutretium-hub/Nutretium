'use strict';

const { FactusolCommerce } = require('../lib/factusol-commerce');
const { cabecerasCORS } = require('../lib/cors');
const security = require('../lib/security-policy');
const catalog = require('../../products-data.js');

const CORS = cabecerasCORS('GET, OPTIONS');
const CACHE_TTL_MS = 20 * 1000;
const MAX_QUERY_CODES = 250;
const ERP_BATCH_SIZE = 100;
const cache = new Map();

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      ...CORS,
      ...security.securityHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
}

function clean(value) {
  return String(value ?? '').trim();
}

function trackedProducts(products = catalog.NUTRETIUM_PRODUCTS) {
  return (Array.isArray(products) ? products : [])
    .filter((product) => product && product.active !== false && clean(product.code) && typeof product.stock === 'number')
    .map((product) => ({ id: Number(product.id), code: clean(product.code) }));
}

function parseRequestedCodes(raw, tracked = trackedProducts()) {
  const allowed = new Set(tracked.map((item) => item.code));
  const requested = clean(raw)
    ? clean(raw).split(',').map(clean).filter(Boolean)
    : [...allowed];
  const unique = [...new Set(requested)].slice(0, MAX_QUERY_CODES);
  return unique.filter((code) => allowed.has(code));
}

function chunk(values, size = ERP_BATCH_SIZE) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

function publicItem(item) {
  const available = Number(item?.available);
  const price = Number(item?.price);
  return {
    code: clean(item?.code),
    available: Number.isFinite(available) ? Math.max(0, available) : 0,
    price: Number.isFinite(price) && price >= 0 ? price : null,
    blocked: item?.blocked === true,
  };
}

async function readLiveCatalog({ service, rawCodes, products } = {}) {
  const tracked = trackedProducts(products);
  const codes = parseRequestedCodes(rawCodes, tracked);
  const checkedAt = new Date().toISOString();
  const base = {
    provider: 'factusol',
    checkedAt,
    requested: codes.length,
    live: false,
    authoritative: false,
    status: 'NOT_READY',
    items: [],
    missingCodes: [],
  };

  if (!codes.length) return { ...base, status: 'EMPTY' };

  const commerce = service || await FactusolCommerce.create();
  const readiness = commerce.readiness();
  if (!readiness.liveCatalogReady) return base;

  const items = [];
  for (const batch of chunk(codes)) {
    const rows = await commerce.fetchByCodes(batch);
    items.push(...rows);
  }

  const sanitized = items.map(publicItem).filter((item) => item.code);
  const found = new Set(sanitized.map((item) => item.code));
  return {
    ...base,
    live: true,
    authoritative: true,
    status: 'LIVE',
    items: sanitized,
    missingCodes: codes.filter((code) => !found.has(code)),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const rawCodes = clean(event.queryStringParameters?.codes);
  const requested = parseRequestedCodes(rawCodes);
  const key = requested.slice().sort().join('|') || '__empty__';
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.until > now) return json(200, cached.payload);

  try {
    const payload = await readLiveCatalog({ rawCodes });
    cache.set(key, { until: now + CACHE_TTL_MS, payload });
    return json(200, payload);
  } catch (error) {
    console.error('[factusol-public-catalog]', error?.code || error?.message || error);
    const payload = {
      provider: 'factusol',
      checkedAt: new Date().toISOString(),
      requested: requested.length,
      live: false,
      authoritative: false,
      status: 'UNREACHABLE',
      items: [],
      missingCodes: [],
    };
    return json(200, payload);
  }
};

exports._test = { trackedProducts, parseRequestedCodes, chunk, publicItem, readLiveCatalog };
