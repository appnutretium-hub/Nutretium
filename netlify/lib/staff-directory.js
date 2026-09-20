'use strict';
const {getBlobStore}=require('./blob-store');
const STORE='staff-directory-v1';
const ROLES=new Set(['compliance','manager','operator','support','custom']);
const PERMISSION=/^[a-z0-9-]+\.(?:read|write|manage|approve|block|\*)$/;
const normalizeEmail=v=>String(v||'').trim().toLowerCase();
const keyFor=email=>'member/'+Buffer.from(normalizeEmail(email)).toString('base64url');
function store(){return getBlobStore(STORE)}
function validate(record){
 const email=normalizeEmail(record?.email),role=String(record?.role||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return{ok:false,error:'Email de empleado no válido.'};
 if(!ROLES.has(role))return{ok:false,error:'Rol no permitido para asignación dinámica.'};
 const permissions=Array.isArray(record?.permissions)?[...new Set(record.permissions.map(String).map(v=>v.trim()).filter(Boolean))]:[];
 if(role==='custom'&&!permissions.length)return{ok:false,error:'Un rol personalizado necesita al menos un permiso.'};
 if(permissions.some(p=>p!=='*'&&!PERMISSION.test(p)))return{ok:false,error:'Hay un permiso personalizado no válido.'};
 return{ok:true,data:{email,role,permissions,active:record?.active!==false,name:String(record?.name||'').trim().slice(0,100),updatedAt:new Date().toISOString()}};
}
async function read(email){const s=store();if(!s)return null;return s.get(keyFor(email),{type:'json',consistency:'strong'}).catch(()=>null)}
async function list(){const s=store();if(!s)return[];const found=await s.list({prefix:'member/'}).catch(()=>({blobs:[]}));const rows=[];for(const item of found.blobs||[]){if(!String(item.key||'').startsWith('member/'))continue;const value=await s.get(item.key,{type:'json',consistency:'strong'}).catch(()=>null);if(value)rows.push(value)}return rows.sort((a,b)=>String(a.email).localeCompare(String(b.email),'es'))}
async function save(record){const checked=validate(record);if(!checked.ok)throw new Error(checked.error);const s=store();if(!s)throw new Error('Directorio de personal no disponible.');const previous=await read(checked.data.email);const next={...checked.data,createdAt:previous?.createdAt||new Date().toISOString()};await s.setJSON(keyFor(next.email),next);return next}
async function remove(email){const normalized=normalizeEmail(email),s=store();if(!s)throw new Error('Directorio de personal no disponible.');await s.delete(keyFor(normalized));return true}
module.exports={ROLES,normalizeEmail,keyFor,validate,read,list,save,remove};
