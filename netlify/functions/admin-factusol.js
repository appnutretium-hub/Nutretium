'use strict';
const { exigePermiso } = require('../lib/staff');
const { cabecerasCORS } = require('../lib/cors');
const vault = require('../lib/factusol-vault');
const { FactusolCommerce } = require('../lib/factusol-commerce');
const audit = require('../lib/audit-log');
const { verifyStepUp } = require('../lib/security-step-up');
const defense = require('../lib/security-defense');
const security = require('../lib/security-policy');

const CORS = cabecerasCORS('GET, POST, OPTIONS');
const json = (statusCode, payload) => ({ statusCode, headers: { ...CORS, ...security.securityHeaders(), 'Cache-Control':'no-store' }, body: JSON.stringify(payload) });

async function requireOwner(event) {
  const staff = await exigePermiso(event, 'platform.write');
  if (!staff.ok) return { response: json(staff.statusCode, { error: staff.error }) };
  if (staff.role !== 'owner' && staff.role !== 'admin') return { response: json(403, { error: 'Solo propietario o administrador pueden gestionar FACTUSOL.' }) };
  return { staff };
}

async function mutationGates(event, staff, scope) {
  const step = await verifyStepUp(event, staff);
  if (!step.ok) return json(step.statusCode, { error: step.error, code: step.code });
  const integrity = await defense.verifyAuditIntegrity();
  if (!integrity.ok) return json(integrity.statusCode, { error: integrity.error, code: integrity.code });
  const nonce = await defense.consumeMutationNonce({ event, actor: staff.email, scope });
  if (!nonce.ok) return json(nonce.statusCode, { error: nonce.error, code: nonce.code });
  return null;
}

async function publicStatus() {
  const [secretStatus, service] = await Promise.all([vault.status(), FactusolCommerce.create()]);
  return { vault: secretStatus, readiness: service.readiness() };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  const auth = await requireOwner(event);
  if (auth.response) return auth.response;
  const staff = auth.staff;

  if (event.httpMethod === 'GET') {
    const status = await publicStatus();
    return json(200, { provider:'factusol', ...status, operator:staff.email, role:staff.role });
  }

  if (event.httpMethod !== 'POST') return json(405, { error:'Method Not Allowed' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error:'JSON no válido.' }); }

  if (!['save','clear','test','discover'].includes(body.action)) return json(400, { error:'Acción no reconocida.' });

  if (body.action === 'test' || body.action === 'discover') {
    const service = await FactusolCommerce.create();
    if (!service.client.readiness().ready) return json(409, { error:'FACTUSOL no tiene credenciales configuradas.', ...(await publicStatus()) });
    try {
      const health = await service.client.health();
      const [warehouses, tariffs] = await Promise.all([service.listWarehouses(), service.listTariffs()]);
      return json(200, {
        ok:true,
        provider:'factusol',
        health,
        warehouses:warehouses.map(x=>({code:x.CODALM,name:x.NOMALM})),
        tariffs:tariffs.map(x=>({code:x.CODTAR,name:x.DESTAR})),
        ...(await publicStatus()),
      });
    } catch (error) {
      return json(502, { error:'No se pudo validar la conexión con FACTUSOL.', detail:String(error.message||error).slice(0,240), ...(await publicStatus()) });
    }
  }

  const gate = await mutationGates(event, staff, `factusol:${body.action}`);
  if (gate) return gate;
  try { await audit.append({ event, actor:staff.email, action:'FACTUSOL_CONFIG_INTENT', resource:'factusol-vault', outcome:'INTENT', metadata:{ operation:body.action } }); }
  catch { return json(503, { error:'No se puede registrar la auditoría; FACTUSOL no se ha modificado.' }); }

  try {
    let state;
    if (body.action === 'clear') {
      await vault.clear();
      state = await publicStatus();
    } else {
      await vault.write({
        manufacturerCode: body.manufacturerCode,
        clientCode: body.clientCode,
        database: body.database,
        password: body.password,
        exercise: body.exercise,
        warehouseCodes: body.warehouseCodes,
        tariffCode: body.tariffCode,
        orderSeries: body.orderSeries,
        orderWarehouse: body.orderWarehouse,
        webCustomerCode: body.webCustomerCode,
        paymentCode: body.paymentCode,
        liveEnabled: body.liveEnabled,
        writeEnabled: body.writeEnabled,
      });
      state = await publicStatus();
    }
    await audit.append({ event, actor:staff.email, action:'FACTUSOL_CONFIG_UPDATED', resource:'factusol-vault', outcome:'SUCCESS', metadata:{ operation:body.action, ready:state.readiness?.ready, liveEnabled:state.readiness?.liveEnabled, writeEnabled:state.readiness?.writeEnabled } }).catch(()=>{});
    return json(200, { ok:true, provider:'factusol', ...state });
  } catch (error) {
    console.error('[admin-factusol]', error);
    return json(error?.code === 'INVALID' ? 422 : 503, { error:error?.code === 'INVALID' ? 'Los datos de FACTUSOL no son válidos.' : 'No se pudo guardar la configuración FACTUSOL.' });
  }
};
