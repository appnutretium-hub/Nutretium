'use strict';
const { secretConfigured } = require('./jwt');
const { verifyStaffEventSession } = require('./session');
const { esAdmin, adminConfigurado } = require('./admin');
function rolesConfig(){try{const raw=JSON.parse(process.env.STAFF_ROLES_JSON||'{}');return raw&&typeof raw==='object'?raw:{}}catch{return{}}}
function permisosDe(email){const e=String(email||'').trim().toLowerCase();if(esAdmin(e))return new Set(['*']);const vals=rolesConfig()[e];return new Set(Array.isArray(vals)?vals.map(String):[])}
async function exigePermiso(event,permiso){
 if(!secretConfigured())return{ok:false,statusCode:503,error:'Las sesiones no están disponibles ahora mismo.'};
 if(!adminConfigurado()&&!Object.keys(rolesConfig()).length)return{ok:false,statusCode:503,error:'Los permisos de administración no están configurados.'};
 let verified;try{verified=await verifyStaffEventSession(event,{allowBearer:true,requireUser:false})}catch{return{ok:false,statusCode:401,error:'La sesión ha caducado. Vuelve a entrar.'}}
 const email=String(verified.email||'').toLowerCase(),permisos=permisosDe(email);
 if(!(permisos.has('*')||permisos.has(permiso)))return{ok:false,statusCode:403,error:'Esta cuenta no tiene permiso para esta operación.'};
 return{ok:true,email,permisos:[...permisos],sessionSource:verified.source};
}
module.exports={rolesConfig,permisosDe,exigePermiso};
