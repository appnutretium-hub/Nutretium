'use strict';

const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');
const { listaAdmins, esAdmin, adminConfigurado } = require('./admin');
const { secretFor } = require('./totp');

const ROLE_ORDER = ['owner','admin','compliance','manager','operator','support','client'];
const ROLE_ENV = {
  owner:'OWNER_EMAILS', compliance:'COMPLIANCE_EMAILS', manager:'MANAGER_EMAILS',
  operator:'OPERATOR_EMAILS', support:'SUPPORT_EMAILS',
};
const PERMISSIONS = Object.freeze({
  owner:['*'], admin:['*'],
  compliance:['platform.read','compliance.read','compliance.approve','compliance.block'],
  manager:['platform.read','platform.write','orders.manage','inventory.manage','purchasing.manage','returns.manage','marketing.manage','subscriptions.manage','loyalty.manage','crm.manage','analytics.read','finance.read','shipping.manage','media.manage','imports.manage','compliance.read','integrations.manage','privacy.manage'],
  operator:['platform.read','orders.manage','inventory.manage','returns.manage','shipping.manage','media.manage'],
  support:['platform.read','orders.read','returns.manage','crm.manage','loyalty.read','privacy.manage'],
  client:[],
});

const parseList = (name) => String(process.env[name] || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(Boolean);

function rolesConfig(){
  try {
    const raw = JSON.parse(process.env.STAFF_ROLES_JSON || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

function roleFor(email){
  const normalized = String(email || '').trim().toLowerCase();
  if(!normalized) return 'client';
  if(parseList(ROLE_ENV.owner).includes(normalized)) return 'owner';
  if(esAdmin(normalized) || listaAdmins().includes(normalized)) return 'admin';
  if(parseList(ROLE_ENV.compliance).includes(normalized)) return 'compliance';
  if(parseList(ROLE_ENV.manager).includes(normalized)) return 'manager';
  if(parseList(ROLE_ENV.operator).includes(normalized)) return 'operator';
  if(parseList(ROLE_ENV.support).includes(normalized)) return 'support';
  return 'client';
}

function permisosDe(email){
  const normalized = String(email || '').trim().toLowerCase();
  const role = roleFor(normalized);
  const permissions = new Set(PERMISSIONS[role] || []);
  const configured = rolesConfig()[normalized];
  if(Array.isArray(configured)) configured.map(String).forEach(permission => permissions.add(permission));
  return permissions;
}

function hasPermission(roleOrPermissions, permission){
  const list = roleOrPermissions instanceof Set ? [...roleOrPermissions] : (PERMISSIONS[roleOrPermissions] || []);
  if(list.includes('*') || list.includes(permission)) return true;
  const [scope] = String(permission || '').split('.');
  return list.includes(`${scope}.*`);
}

function authenticate(event){
  if(!secretConfigured()) return {ok:false,statusCode:503,error:'Las sesiones no están disponibles.'};
  const token = tokenFromHeader((event && event.headers) || {});
  if(!token) return {ok:false,statusCode:401,error:'Hay que iniciar sesión.'};
  let claims;
  try { claims = verifyJWT(token); }
  catch { return {ok:false,statusCode:401,error:'La sesión ha caducado. Vuelve a entrar.'}; }
  const email = String(claims.email || '').trim().toLowerCase();
  const secret = secretFor(email);
  const required = String(process.env.REQUIRE_STAFF_MFA || 'false').toLowerCase() === 'true';
  if((required || secret) && claims.mfa !== true) return {ok:false,statusCode:401,error:'Esta sesión de personal requiere verificación MFA. Entra de nuevo desde el panel.'};
  return {ok:true,email,claims};
}

function requireStaff(event, permission='platform.read'){
  const auth = authenticate(event);
  if(!auth.ok) return auth;
  const role = roleFor(auth.email);
  const permissions = permisosDe(auth.email);
  if(role === 'client' && permissions.size === 0) return {ok:false,statusCode:403,error:'Esta cuenta no tiene permiso para esta operación.'};
  if(!hasPermission(permissions, permission)) return {ok:false,statusCode:403,error:'Esta cuenta no tiene permiso para esta operación.'};
  return {ok:true,email:auth.email,role,claims:auth.claims,permisos:[...permissions]};
}

function exigePermiso(event, permiso){
  if(!adminConfigurado() && !Object.keys(rolesConfig()).length && !Object.values(ROLE_ENV).some(name => parseList(name).length)) {
    return {ok:false,statusCode:503,error:'Los permisos de administración no están configurados.'};
  }
  return requireStaff(event, permiso);
}

function staffConfig(){
  return {
    owners:parseList(ROLE_ENV.owner).length, admins:listaAdmins().length,
    compliance:parseList(ROLE_ENV.compliance).length, managers:parseList(ROLE_ENV.manager).length,
    operators:parseList(ROLE_ENV.operator).length, support:parseList(ROLE_ENV.support).length,
    custom:Object.keys(rolesConfig()).length,
    mfaRequired:String(process.env.REQUIRE_STAFF_MFA || 'false').toLowerCase() === 'true',
  };
}

module.exports = { ROLE_ORDER, PERMISSIONS, rolesConfig, roleFor, permisosDe, hasPermission, requireStaff, exigePermiso, staffConfig };

