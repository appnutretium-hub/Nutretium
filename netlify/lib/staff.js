'use strict';

const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');
const { esAdmin, adminConfigurado } = require('./admin');

function rolesConfig(){
  try{
    const raw=JSON.parse(process.env.STAFF_ROLES_JSON||'{}');
    return raw&&typeof raw==='object'?raw:{};
  }catch{return{};}
}
function permisosDe(email){
  const e=String(email||'').trim().toLowerCase();
  if(esAdmin(e)) return new Set(['*']);
  const cfg=rolesConfig();
  const vals=cfg[e];
  return new Set(Array.isArray(vals)?vals.map(String):[]);
}
function exigePermiso(event,permiso){
  if(!secretConfigured()) return {ok:false,statusCode:503,error:'Las sesiones no están disponibles ahora mismo.'};
  if(!adminConfigurado() && !Object.keys(rolesConfig()).length) return {ok:false,statusCode:503,error:'Los permisos de administración no están configurados.'};
  const token=tokenFromHeader(event.headers||{});
  if(!token) return {ok:false,statusCode:401,error:'Hay que iniciar sesión.'};
  let claims; try{claims=verifyJWT(token);}catch{return {ok:false,statusCode:401,error:'La sesión ha caducado. Vuelve a entrar.'};}
  const email=String(claims.email||'').toLowerCase();
  const permisos=permisosDe(email);
  if(!(permisos.has('*')||permisos.has(permiso))) return {ok:false,statusCode:403,error:'Esta cuenta no tiene permiso para esta operación.'};
  return {ok:true,email,permisos:[...permisos]};
}
module.exports={rolesConfig,permisosDe,exigePermiso};
