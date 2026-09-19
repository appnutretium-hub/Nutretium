'use strict';
const { secretConfigured } = require('./jwt');
const { verifyStaffEventSession } = require('./session');
const { esAdmin, adminConfigurado } = require('./admin');

function rolesConfig() {
  try {
    const raw = JSON.parse(process.env.STAFF_ROLES_JSON || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function permisosDe(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (esAdmin(normalized)) return new Set(['*']);

  const config = rolesConfig();
  const key = Object.keys(config).find(k => k.toLowerCase() === normalized);
  const values = key ? config[key] : undefined;
  return new Set(Array.isArray(values) ? values.map(String) : []);
}

function roleFor(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return 'client';
  if (esAdmin(normalized)) return 'admin';
  return permisosDe(normalized).size ? 'staff' : 'client';
}

async function exigePermiso(event, permiso) {
  if (!secretConfigured()) {
    return { ok: false, statusCode: 503, error: 'Las sesiones no están disponibles ahora mismo.' };
  }
  if (!adminConfigurado() && !Object.keys(rolesConfig()).length) {
    return { ok: false, statusCode: 503, error: 'Los permisos de administración no están configurados.' };
  }

  let verified;
  try {
    verified = await verifyStaffEventSession(event, { allowBearer: true, requireUser: false });
  } catch {
    return { ok: false, statusCode: 401, error: 'La sesión ha caducado. Vuelve a entrar.' };
  }

  const email = String(verified.email || '').toLowerCase();
  const permisos = permisosDe(email);
  if (!(permisos.has('*') || permisos.has(permiso))) {
    return { ok: false, statusCode: 403, error: 'Esta cuenta no tiene permiso para esta operación.' };
  }

  return { ok: true, email, permisos: [...permisos], sessionSource: verified.source };
}

module.exports = { rolesConfig, permisosDe, roleFor, exigePermiso };
