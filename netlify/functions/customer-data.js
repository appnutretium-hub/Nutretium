'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { verifyEventSession } = require('../lib/session');
const usuarios = require('../lib/usuarios');
const direccion = require('../lib/direccion');
const { NUTRETIUM_PRODUCTS = [] } = require('../../products-data.js');

const CORS = cabecerasCORS('GET, POST, OPTIONS');
const activeIds = new Set(NUTRETIUM_PRODUCTS.filter(p => p && p.active !== false).map(p => Number(p.id)));
const response = (statusCode, payload) => ({ statusCode, headers:CORS, body:JSON.stringify(payload) });

function publicData(user) {
  const addresses = Array.isArray(user.addresses) ? user.addresses.map(a => ({
    id:String(a.id||''), label:String(a.label||''), isDefault:Boolean(a.isDefault), direccion:direccion.normaliza(a.direccion)
  })) : [];
  const wishlist = Array.isArray(user.wishlist) ? user.wishlist.map(Number).filter(id => activeIds.has(id)).slice(0,200) : [];
  return { wishlist, addresses };
}

function safeLabel(value) {
  return String(value || '').trim().replace(/[<>]/g,'').slice(0,40) || 'Dirección';
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  if (!['GET','POST'].includes(event.httpMethod)) return response(405,{error:'Method Not Allowed'});
  let session;
  try { session = await verifyEventSession(event); }
  catch { return response(401,{error:'Sesión caducada. Vuelve a iniciar sesión.'}); }
  const user = session.user;
  if (!user) return response(404,{error:'Usuario no encontrado.'});

  if (event.httpMethod === 'GET') return response(200, publicData(user));
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return response(400,{error:'Invalid JSON'}); }

  if (body.action === 'save-wishlist') {
    const incoming = Array.isArray(body.ids) ? body.ids : [];
    const wishlist = [...new Set(incoming.map(Number).filter(id => activeIds.has(id)))].slice(0,200);
    const updated = { ...user, wishlist, updatedAt:new Date().toISOString() };
    await usuarios.escribe(session.email, updated);
    return response(200,{ wishlist });
  }

  if (body.action === 'add-address') {
    const dir = direccion.normaliza(body.direccion);
    const problem = direccion.revisa(dir);
    if (problem) return response(400,{error:problem});
    const current = Array.isArray(user.addresses) ? user.addresses.slice(0,9) : [];
    const id = crypto.randomUUID();
    const shouldDefault = body.isDefault === true || current.length === 0;
    const addresses = current.map(a => shouldDefault ? {...a,isDefault:false} : a);
    addresses.push({ id, label:safeLabel(body.label), direccion:dir, isDefault:shouldDefault, createdAt:new Date().toISOString() });
    const updated = { ...user, addresses, updatedAt:new Date().toISOString() };
    await usuarios.escribe(session.email, updated);
    return response(201, publicData(updated));
  }

  if (body.action === 'delete-address') {
    const id = String(body.id || '');
    let addresses = (Array.isArray(user.addresses) ? user.addresses : []).filter(a => String(a.id) !== id);
    if (!addresses.some(a => a.isDefault) && addresses[0]) addresses[0] = {...addresses[0],isDefault:true};
    const updated = { ...user, addresses, updatedAt:new Date().toISOString() };
    await usuarios.escribe(session.email, updated);
    return response(200, publicData(updated));
  }

  if (body.action === 'set-default-address') {
    const id = String(body.id || '');
    const existing = Array.isArray(user.addresses) ? user.addresses : [];
    if (!existing.some(a => String(a.id) === id)) return response(404,{error:'Dirección no encontrada.'});
    const addresses = existing.map(a => ({...a,isDefault:String(a.id)===id}));
    const updated = { ...user, addresses, updatedAt:new Date().toISOString() };
    await usuarios.escribe(session.email, updated);
    return response(200, publicData(updated));
  }

  return response(400,{error:'Acción no reconocida.'});
};
