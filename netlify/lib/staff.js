'use strict';
const { secretConfigured } = require('./jwt');
const { verifyStaffEventSession } = require('./session');
const { esAdmin, listaAdmins } = require('./admin');

const ROLE_ORDER = ['owner','admin','compliance','manager','operator','support','custom','client'];
const ROLE_ENV = Object.freeze({
  owner: 'OWNER_EMAILS',
  compliance: 'COMPLIANCE_EMAILS',
  manager: 'MANAGER_EMAILS',
  operator: 'OPERATOR_EMAILS',
  support: 'SUPPORT_EMAILS',
});
const PERMISSIONS = Object.freeze({
  owner: ['*'],
  admin: ['*'],
  compliance: ['platform.read','compliance.read','compliance.approve','compliance.block'],
  manager: [
    'platform.read','platform.write','orders.read','orders.manage','inventory.read','inventory.manage',
    'purchasing.read','purchasing.manage','returns.manage','marketing.read','marketing.manage',
    'subscriptions.read','subscriptions.manage','loyalty.read','loyalty.manage','crm.read','crm.manage',
    'analytics.read','finance.read','shipping.manage','media.manage','imports.manage','compliance.read',
    'privacy.manage'
  ],
  operator: ['platform.read','orders.read','orders.manage','inventory.read','inventory.manage','returns.manage','shipping.manage','media.manage'],
  support: ['platform.read','orders.read','returns.manage','crm.read','crm.manage','loyalty.read','privacy.manage'],
  custom: [],
  client: [],
});

const parseList = (name) => String(process.env[name] || '')
  .split(/[,;\s]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);

function rolesConfig() {
  try {
    const raw = JSON.parse(process.env.STAFF_ROLES_JSON || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function roleFor(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return 'client';
  if (parseList(ROLE_ENV.owner).includes(normalized)) return 'owner';
  if (esAdmin(normalized)) return 'admin';
  if (parseList(ROLE_ENV.compliance).includes(normalized)) return 'compliance';
  if (parseList(ROLE_ENV.manager).includes(normalized)) return 'manager';
  if (parseList(ROLE_ENV.operator).includes(normalized)) return 'operator';
  if (parseList(ROLE_ENV.support).includes(normalized)) return 'support';
  if (Array.isArray(rolesConfig()[normalized]) && rolesConfig()[normalized].length) return 'custom';
  return 'client';
}

function hasPermission(role, permission) {
  const list = PERMISSIONS[role] || [];
  if (list.includes('*') || list.includes(String(permission))) return true;
  const [scope] = String(permission || '').split('.');
  return Boolean(scope) && list.includes(`${scope}.*`);
}

function permisosDe(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return new Set();
  const role = roleFor(normalized);
  const permissions = new Set(PERMISSIONS[role] || []);
  const custom = rolesConfig()[normalized];
  if (Array.isArray(custom)) custom.map(String).forEach((permission) => permissions.add(permission));
  return permissions;
}

function staffConfigured() {
  return listaAdmins().length > 0 || Object.values(ROLE_ENV).some((name) => parseList(name).length > 0) || Object.keys(rolesConfig()).length > 0;
}

function permissionSetAllows(permissions, permission) {
  if (permissions.has('*') || permissions.has(String(permission))) return true;
  const [scope] = String(permission || '').split('.');
  return Boolean(scope) && permissions.has(`${scope}.*`);
}

async function requireStaff(event, permission = 'platform.read') {
  if (!secretConfigured()) return { ok: false, statusCode: 503, error: 'Las sesiones no están disponibles.' };
  if (!staffConfigured()) return { ok: false, statusCode: 503, error: 'Los permisos internos no están configurados.' };
  let verified;
  try {
    verified = await verifyStaffEventSession(event, { allowBearer: true, requireUser: true });
  } catch {
    return { ok: false, statusCode: 401, error: 'La sesión ha caducado. Vuelve a entrar.' };
  }
  const email = String(verified.email || '').trim().toLowerCase();
  const role = roleFor(email);
  const permissions = permisosDe(email);
  if (!permissionSetAllows(permissions, permission)) return { ok: false, statusCode: 403, error: 'Esta cuenta no tiene permiso para esta operación.' };
  return { ok: true, email, role, claims: verified.claims, permissions: [...permissions], sessionSource: verified.source };
}

async function exigePermiso(event, permiso) {
  const auth = await requireStaff(event, permiso);
  if (!auth.ok) return auth;
  return { ...auth, permisos: auth.permissions };
}

function staffConfig() {
  return {
    owners: parseList(ROLE_ENV.owner).length,
    admins: listaAdmins().length,
    compliance: parseList(ROLE_ENV.compliance).length,
    managers: parseList(ROLE_ENV.manager).length,
    operators: parseList(ROLE_ENV.operator).length,
    support: parseList(ROLE_ENV.support).length,
    custom: Object.keys(rolesConfig()).length,
  };
}

module.exports = {
  ROLE_ORDER,
  ROLE_ENV,
  PERMISSIONS,
  rolesConfig,
  roleFor,
  hasPermission,
  permisosDe,
  staffConfigured,
  requireStaff,
  exigePermiso,
  staffConfig,
};
