/** Administración NUTRETIUM: autoridad por ADMIN_EMAILS y sesión interna revocable. */
'use strict';
const { secretConfigured } = require('./jwt');
const { verifyStaffEventSession } = require('./session');
function listaAdmins(){return String(process.env.ADMIN_EMAILS||'').split(/[,;\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean)}
const adminConfigurado=()=>listaAdmins().length>0;
function esAdmin(email){const correo=String(email||'').trim().toLowerCase();return correo!==''&&listaAdmins().includes(correo)}
const rolDe=email=>esAdmin(email)?'admin':'cliente';
async function exigeAdmin(event){
 if(!secretConfigured())return{ok:false,statusCode:503,error:'Las sesiones no están disponibles ahora mismo.'};
 if(!adminConfigurado())return{ok:false,statusCode:503,error:'El panel de administración no está configurado.'};
 let verified;try{verified=await verifyStaffEventSession(event,{allowBearer:false,requireUser:true})}catch{return{ok:false,statusCode:401,error:'La sesión ha caducado. Vuelve a entrar.'}}
 if(verified.source!=='cookie')return{ok:false,statusCode:401,error:'Se requiere una sesión administrativa interna.'};
 if(!esAdmin(verified.email))return{ok:false,statusCode:403,error:'Esta cuenta no tiene acceso al panel.'};
 return{ok:true,email:String(verified.email).toLowerCase(),sessionSource:'cookie'};
}
module.exports={listaAdmins,adminConfigurado,esAdmin,rolDe,exigeAdmin};