'use strict';

const { requireStaff } = require('../lib/staff');
const { FactusolCommerce } = require('../lib/factusol-commerce');
const { cabecerasCORS } = require('../lib/cors');

const CORS = cabecerasCORS('GET, OPTIONS');
const json = (statusCode, body) => ({ statusCode, headers: { ...CORS, 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  const auth = await requireStaff(event, 'integrations.manage');
  if (!auth.ok) return json(auth.statusCode, { error: auth.error });

  const service = new FactusolCommerce();
  const readiness = service.readiness();
  if (!readiness.ready) return json(200, { provider: 'factusol', status: 'NOT_CONFIGURED', readiness });

  try {
    const health = await service.client.health();
    const [warehouses, tariffs] = await Promise.all([
      service.listWarehouses().catch(() => []),
      service.listTariffs().catch(() => []),
    ]);
    return json(200, {
      provider: 'factusol',
      status: 'CONNECTED',
      readiness,
      health,
      warehouses: warehouses.map(x => ({ code: x.CODALM, name: x.NOMALM })),
      tariffs: tariffs.map(x => ({ code: x.CODTAR, name: x.DESTAR })),
    });
  } catch (error) {
    return json(200, {
      provider: 'factusol',
      status: 'CONNECTION_FAILED',
      readiness,
      error: String(error.message || error).slice(0, 240),
    });
  }
};
