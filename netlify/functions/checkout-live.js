'use strict';
const baseCheckout = require('./checkout');
const { valorarCarrito } = require('../lib/catalogo');
const { FactusolCommerce } = require('../lib/factusol-commerce');
const { cabecerasCORS } = require('../lib/cors');

const CORS = cabecerasCORS('POST, OPTIONS');
const json = (statusCode, payload) => ({ statusCode, headers:{...CORS,'Cache-Control':'no-store'}, body:JSON.stringify(payload) });
function cents(v){return Math.round(Number(v)*100)}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  if (event.httpMethod !== 'POST') return baseCheckout.handler(event, context);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400,{error:'JSON no válido.'}); }
  const local = valorarCarrito(body.items);
  if (!local.ok) return json(400,{error:local.errores[0],detalles:local.errores});

  let service;
  try { service = await FactusolCommerce.create(); }
  catch (error) {
    console.error('[checkout-live] factusol init',error);
    return json(503,{error:'No se puede verificar el inventario central. No se iniciará ningún cobro.',motivo:'factusol-unavailable'});
  }
  const readiness = service.readiness();
  if (!readiness.liveEnabled) return baseCheckout.handler(event, context);
  if (!readiness.liveCatalogReady) return json(503,{error:'La sincronización con FACTUSOL está activada pero incompleta. No se iniciará ningún cobro.',motivo:'factusol-not-ready'});

  let check;
  try { check = await service.validateCart(local.lineas); }
  catch (error) {
    console.error('[checkout-live] factusol validation',error);
    return json(503,{error:'No se ha podido confirmar stock y precio en FACTUSOL. No se iniciará ningún cobro.',motivo:'factusol-validation-failed'});
  }
  if (!check.ok) {
    const stockProblem = check.problems.find(x=>x.reason==='insufficient-stock');
    return json(409,{error:stockProblem?`Stock actualizado: solo quedan ${stockProblem.available} unidades de ${stockProblem.code}.`:'El catálogo de FACTUSOL no coincide con el pedido. Actualiza la página antes de continuar.',motivo:'factusol-catalog-conflict',detalles:check.problems});
  }

  const erpByCode = new Map(check.items.map(x=>[String(x.code),x]));
  const priceProblems=[];
  for (const line of local.lineas) {
    const erp=erpByCode.get(String(line.code));
    if (!erp || erp.price===null || cents(erp.price)!==cents(line.price)) priceProblems.push({code:line.code,web:line.price,erp:erp?.price??null});
  }
  if (priceProblems.length) return json(409,{error:'El precio de uno o más productos ha cambiado en FACTUSOL. Actualiza la página antes de pagar.',motivo:'factusol-price-conflict',detalles:priceProblems});

  return baseCheckout.handler(event, context);
};
