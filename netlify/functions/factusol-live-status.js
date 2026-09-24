'use strict';
const { requireStaff } = require('../lib/staff');

const { FactusolCommerce } = require('../lib/factusol-commerce');
const { cabecerasCORS } = require('../lib/cors');
const security = require('../lib/security-policy');
const catalog = require('../../products-data.js');

const CORS = cabecerasCORS('GET, OPTIONS');
const TTL_MS = 60 * 1000;
let cached = null;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      ...CORS,
      ...security.securityHeaders(),
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  };
}

function sampleCodes() {
  const products = Array.isArray(catalog.NUTRETIUM_PRODUCTS) ? catalog.NUTRETIUM_PRODUCTS : [];
  return products
    .filter((item) => item?.active === true && /^\d+$/.test(String(item.code || '')) && item.stock !== null)
    .map((item) => String(item.code))
    .slice(0, 5);
}

async function probe() {
  const service = await FactusolCommerce.create();
  const readiness = service.readiness();
  const base = {
    provider: 'factusol',
    checkedAt: new Date().toISOString(),
    configured: readiness.ready === true,
    warehouseConfigured: readiness.warehouseCodesConfigured === true,
    tariffConfigured: readiness.tariffConfigured === true,
    liveEnabled: readiness.liveEnabled === true,
    liveCatalogReady: readiness.liveCatalogReady === true,
    apiReachable: false,
    stockReadable: false,
    sampleRequested: 0,
    sampleMatched: 0,
    priceReadable: 0,
    status: 'NOT_READY',
  };

  if (!readiness.liveCatalogReady) return base;

  try {
    await service.client.health();
    base.apiReachable = true;

    const codes = sampleCodes();
    base.sampleRequested = codes.length;
    if (!codes.length) {
      base.status = 'DEGRADED';
      return base;
    }

    const items = await service.fetchByCodes(codes);
    base.sampleMatched = items.length;
    base.stockReadable = items.some((item) => Number.isFinite(Number(item.available)));
    base.priceReadable = items.filter((item) => Number.isFinite(Number(item.price))).length;
    base.status = base.apiReachable && base.stockReadable && base.sampleMatched > 0 && base.priceReadable > 0
      ? 'LIVE'
      : 'DEGRADED';
    return base;
  } catch {
    base.status = 'UNREACHABLE';
    return base;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  // Consulta el ERP en directo: solo personal, como factusol-status. Antes era
  // un GET anónimo que cualquiera podía lanzar contra FACTUSOL.
  const auth = await requireStaff(event, 'platform.read');
  if (!auth.ok) return json(auth.statusCode, { error: auth.error });

  const now = Date.now();
  if (cached && cached.until > now) return json(200, cached.payload);

  const payload = await probe();
  cached = { until: now + TTL_MS, payload };
  return json(200, payload);
};

exports._test = { sampleCodes, probe };
