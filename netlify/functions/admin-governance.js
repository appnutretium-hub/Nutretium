'use strict';
const crypto=require('crypto');
const {cabecerasCORS}=require('../lib/cors');
const {requireStaff,PERMISSIONS}=require('../lib/staff');
const directory=require('../lib/staff-directory');
const audit=require('../lib/audit-log');
const {getBlobStore}=require('../lib/blob-store');
const usuarios=require('../lib/usuarios');
const {hashPassword}=require('../lib/passwords');
const {secretFor}=require('../lib/totp');
const CORS=cabecerasCORS('POST, OPTIONS');
const response=(statusCode,body)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(body)});
const ownerOrAdmin=auth=>['owner','admin'].includes(auth.role);

async function backupList(){
 const store=getBlobStore('enterprise-backups-v1');if(!store)return[];
 const found=await store.list({prefix:'daily/'}).catch(()=>({blobs:[]}));
 return(found.blobs||[]).filter(x=>/^daily\/\d{4}-\d{2}-\d{2}$/.test(String(x.key||''))).sort((a,b)=>String(b.key).localeCompare(String(a.key))).slice(0,30).map(x=>({key:x.key,etag:x.etag||null}));
}
async function staffRows(){
 const rows=await directory.list();
 const out=[];for(const row of rows){const user=await usuarios.lee(row.email).catch(()=>null);out.push({...row,accountExists:Boolean(user),emailVerified:Boolean(user?.emailVerifiedAt),mfaConfigured:Boolean(secretFor(row.email)),passwordChangedAt:user?.passwordChangedAt||null})}return out;
}
function permissionsCatalog(){return Object.fromEntries(Object.entries(PERMISSIONS).filter(([role])=>role!=='owner'&&role!=='admin'&&role!=='client').map(([role,items])=>[role,items]))}
async function ensureAccount(record,initialPassword){
 const email=String(record.email||'').trim().toLowerCase(),existing=await usuarios.lee(email);if(existing)return{created:false};
 if(!initialPassword)return{created:false,missing:true};
 if(typeof initialPassword!=='string'||initialPassword.length<12||initialPassword.length>128)throw Object.assign(new Error('La contraseña inicial debe tener entre 12 y 128 caracteres.'),{statusCode:400});
 const now=new Date().toISOString(),created=await usuarios.crea(email,{id:crypto.randomUUID(),name:String(record.name||'Personal Nutretium').trim()||'Personal Nutretium',surname:'',email,phone:'',direccion:{},passwordHash:hashPassword(initialPassword),createdAt:now,updatedAt:now,staffCreatedAt:now,passwordChangedAt:now});
 if(!created)throw Object.assign(new Error('No se pudo crear la cuenta interna.'),{statusCode:409});return{created:true};
}

exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});
 const auth=await requireStaff(event,'platform.read');if(!auth.ok)return response(auth.statusCode,{error:auth.error});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'JSON no válido.'})}
 const action=String(body.action||'overview');
 try{
  if(action==='overview'){
   const backups=ownerOrAdmin(auth)?await backupList():[];
   const verify=ownerOrAdmin(auth)?await audit.verify(500):null;
   return response(200,{actor:{email:auth.email,role:auth.role,permissions:auth.permissions},security:{staffMfaRequired:String(process.env.REQUIRE_STAFF_MFA||'false').toLowerCase()==='true',mfaConfigured:Boolean(secretFor(auth.email)),audit:verify},backups,tpvsol:{status:'NOT_VALIDATED',configured:false,message:'No hay integración TPVsol/FACTUSOL verificada en el repositorio. El panel puede preparar mapeos, pero no debe simular sincronización.'}});
  }
  if(!ownerOrAdmin(auth))return response(403,{error:'Solo propietario o administrador pueden gestionar esta sección.'});
  if(action==='staff-list')return response(200,{records:await staffRows(),permissionCatalog:permissionsCatalog()});
  if(action==='staff-save'){
   const email=String(body.record?.email||'').trim().toLowerCase();if(email===auth.email&&body.record?.active===false)return response(409,{error:'No puedes desactivar tu propia cuenta desde esta sesión.'});
   const saved=await directory.save(body.record||{}),account=await ensureAccount(saved,String(body.initialPassword||''));await audit.append({event,actor:auth.email,action:'STAFF_ACCESS_UPDATED',resource:saved.email,outcome:'SUCCESS',metadata:{role:saved.role,active:saved.active,permissions:saved.permissions,accountCreated:account.created}});return response(200,{record:saved,account});
  }
  if(action==='staff-remove'){
   const email=String(body.email||'').trim().toLowerCase();if(!email)return response(400,{error:'Falta el email.'});if(email===auth.email)return response(409,{error:'No puedes eliminar tu propio acceso desde esta sesión.'});await directory.remove(email);await audit.append({event,actor:auth.email,action:'STAFF_ACCESS_REMOVED',resource:email,outcome:'SUCCESS'});return response(200,{ok:true});
  }
  if(action==='audit-list')return response(200,{events:await audit.recent(Math.min(200,Math.max(1,Number(body.limit)||100))),verification:await audit.verify(1000)});
  if(action==='backup-list')return response(200,{backups:await backupList()});
  return response(400,{error:'Acción no reconocida.'});
 }catch(err){console.error('[admin-governance]',err);return response(err.statusCode||500,{error:err.message||'No se pudo completar la operación.'})}
};