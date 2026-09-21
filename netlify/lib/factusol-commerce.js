'use strict';

const { FactusolClient } = require('./factusol-client');

function clean(v) { return String(v ?? '').trim(); }
function csvSet(v) { return new Set(clean(v).split(',').map(x => x.trim()).filter(Boolean)); }
function sqlLiteral(v) { return `'${String(v).replace(/'/g, "''")}'`; }
function sqlIn(values) {
  const unique = [...new Set((values || []).map(clean).filter(Boolean))];
  if (!unique.length) return null;
  if (unique.length > 100) throw new Error('Demasiados códigos para una sola consulta FACTUSOL.');
  return unique.map(sqlLiteral).join(',');
}
function asNumber(v) { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; }

class FactusolCommerce {
  constructor({ env = process.env, fetchImpl = global.fetch } = {}) {
    this.env = env;
    this.client = new FactusolClient({ env, fetchImpl });
    this.warehouses = csvSet(env.FACTUSOL_WAREHOUSE_CODES);
    this.tariff = clean(env.FACTUSOL_TARIFF_CODE);
  }

  readiness() {
    const api = this.client.readiness();
    return {
      ...api,
      warehouseCodesConfigured: this.warehouses.size > 0,
      warehouseCodes: [...this.warehouses],
      tariffConfigured: Boolean(this.tariff),
      tariffCode: this.tariff || null,
      liveCatalogReady: api.ready && this.warehouses.size > 0 && Boolean(this.tariff),
    };
  }

  async listWarehouses() {
    return this.client.query('SELECT CODALM, NOMALM FROM F_ALM ORDER BY CODALM');
  }

  async listTariffs() {
    return this.client.query('SELECT CODTAR, DESTAR FROM F_TAR ORDER BY CODTAR');
  }

  async fetchByCodes(codes) {
    const list = sqlIn(codes);
    if (!list) return [];
    const productSql = `SELECT CODART, CCOART, DESART, EANART, FAMART, NPUART FROM F_ART WHERE CODART IN (${list})`;
    const priceSql = `SELECT ARTLTA, TARLTA, PRELTA FROM F_LTA WHERE ARTLTA IN (${list})`;
    const stockSql = `SELECT ARTSTO, ALMSTO, ACTSTO, DISSTO, MINSTO, MAXSTO FROM F_STO WHERE ARTSTO IN (${list})`;
    const [products, prices, stock] = await Promise.all([
      this.client.query(productSql),
      this.client.query(priceSql),
      this.client.query(stockSql),
    ]);

    const priceByCode = new Map();
    for (const row of prices) {
      const code = clean(row.ARTLTA), tariff = clean(row.TARLTA);
      if (!code || (this.tariff && tariff !== this.tariff)) continue;
      if (!priceByCode.has(code)) priceByCode.set(code, { tariff, price: asNumber(row.PRELTA) });
    }

    const stockByCode = new Map();
    for (const row of stock) {
      const code = clean(row.ARTSTO), warehouse = clean(row.ALMSTO);
      if (!code || (this.warehouses.size && !this.warehouses.has(warehouse))) continue;
      const current = asNumber(row.ACTSTO) ?? 0;
      const available = asNumber(row.DISSTO);
      const prev = stockByCode.get(code) || { current: 0, available: 0, warehouses: [] };
      prev.current += current;
      prev.available += available === null ? current : available;
      prev.warehouses.push({ code: warehouse, current, available: available === null ? current : available });
      stockByCode.set(code, prev);
    }

    return products.map(row => {
      const code = clean(row.CODART);
      const p = priceByCode.get(code) || null;
      const s = stockByCode.get(code) || { current: 0, available: 0, warehouses: [] };
      return {
        code,
        name: clean(row.CCOART || row.DESART),
        description: clean(row.DESART),
        ean: clean(row.EANART) || null,
        family: clean(row.FAMART) || null,
        blocked: Number(row.NPUART) === 1,
        tariff: p?.tariff || null,
        price: p?.price ?? null,
        stock: s.current,
        available: Math.max(0, s.available),
        warehouses: s.warehouses,
      };
    });
  }

  async validateCart(lines) {
    const requested = new Map();
    for (const line of Array.isArray(lines) ? lines : []) {
      const code = clean(line.code);
      const qty = Number(line.qty);
      if (!code || !Number.isInteger(qty) || qty < 1) continue;
      requested.set(code, (requested.get(code) || 0) + qty);
    }
    const current = await this.fetchByCodes([...requested.keys()]);
    const byCode = new Map(current.map(x => [x.code, x]));
    const problems = [];
    for (const [code, qty] of requested) {
      const item = byCode.get(code);
      if (!item) { problems.push({ code, reason: 'not-found' }); continue; }
      if (item.blocked) { problems.push({ code, reason: 'blocked' }); continue; }
      if (item.price === null) { problems.push({ code, reason: 'missing-price' }); continue; }
      if (item.available < qty) problems.push({ code, reason: 'insufficient-stock', requested: qty, available: item.available });
    }
    return { ok: problems.length === 0, problems, items: current };
  }
}

module.exports = { FactusolCommerce, clean, csvSet, sqlLiteral, sqlIn, asNumber };
