'use strict';

const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');
const { listaAdmins } = require('./admin');

const parseList = (name) => String(process.env[name] || '')
  .split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter(Boolean);

const ROLE_ORDER = ['owner','admin','compliance','manager','operator','support','client'];
const ROLE_ENV = {
  owner:'OWNER_EMAILS', compliance:'COMPLIANCE_EMAILS', manager:'MANAGER_EMAILS',
  operator:'OPERATOR_EMAILS', support:'SUPPORT_EMAILS',
};

const PERMISSIONS = Object.freeze({
  owner:['*'], admin:['*'],
  compliance:['platform.read','compliance.read','compliance.approve','compliance.block'],
  manager:[
    'platform.read','platform.write','orders.manage','inventory.manage','purchasing.manage',
    'returns.manage','marketing.manage','subscriptions.manage','loyalty.manage','crm.manage',
    'analytics.read','finance.read','shipping.manage','media.manage','imports.manage','compliance.read'
  ],
  operator:['platform.read','orders.manage','inventory.manage','returns.manage','shipping.manage','media.manage'],
  support:['platform.read','orders.read','returns.manage','crm.manage','loyalty.read','privacy.manage'],
  client:[],
});

function roleFor(email){
  const normalized=String(email||'').trim().toLowerCase();
  if(!normalized) return 'client';
  if(parseList(ROLE_ENV.owner).includes(normalized)) return 'owner';
  if(listaAdmins().includes(normalized)) return 'admin';
  if(parseList(ROLE_ENV.compliance).includes(normalized)) return 'compliance';
  if(parseList(ROLE_ENV.manager).includes(normalized)) return 'manager';
  if(parseList(ROLE_ENV.operator).includes(normalized)) return 'operator';
  if(parseList(ROLE_ENV.support).includes(normalized)) return 'support';
  return 'client';
}
function hasPermission(role,permission){
  const list=PERMISSIONS[role]||[];
  if(list.includes('*')||list.includes(permission)) return true;
  const [scope]=String(permission||'').split('.');
  return list.includes(`${scope}.*`);
}
function requireStaff(event,permission='platform.read'){
  if(!secretConfigured()) return {ok:false,statusCode:503,error:'Las sesiones no están disponibles.'};
  const token=tokenFromHeader((event&&event.headers)||{});
  if(!token) return {ok:false,statusCode:401,error:'Hay que iniciar sesión.'};
  let claims; try{claims=verifyJWT(token);}catch{return {ok:false,statusCode:401,error:'La sesión ha caducado. Vuelve a entrar.'};}
  const email=String(claims.email||'').trim().toLowerCase(), role=roleFor(email);
  if(!hasPermission(role,permission)) return {ok:false,statusCode:403,error:'Esta cuenta no tiene permiso para esta operación.'};
  return {ok:true,email,role,claims};
}
function staffConfig(){return {owners:parseList(ROLE_ENV.owner).length,admins:listaAdmins().length,compliance:parseList(ROLE_ENV.compliance).length,managers:parseList(ROLE_ENV.manager).length,operators:parseList(ROLE_ENV.operator).length,support:parseList(ROLE_ENV.support).length};}
module.exports={ROLE_ORDER,PERMISSIONS,roleFor,hasPermission,requireStaff,staffConfig};
