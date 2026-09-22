'use strict';
const directory=require('./staff-directory');
const usuarios=require('./usuarios');
const totp=require('./totp');
const {PRIMARY_OWNER_EMAIL}=require('./staff');

const normalize=v=>String(v||'').trim().toLowerCase();
const list=v=>String(v||'').split(/[,;\s]+/).map(normalize).filter(Boolean);
function rolesConfig(env=process.env){try{const raw=JSON.parse(env.STAFF_ROLES_JSON||'{}');return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}}catch{return{}}}
function secretMap(env=process.env){try{const raw=JSON.parse(env.STAFF_TOTP_SECRETS||'{}');return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}}catch{return{}}}
function envSecretFor(email,env=process.env){const target=normalize(email),map=secretMap(env),key=Object.keys(map).find(k=>normalize(k)===target);return key?String(map[key]||'').trim():''}
function validSecret(secret){const clean=String(secret||'').trim().toUpperCase().replace(/\s+/g,'');if(!/^[A-Z2-7]{16,}$/.test(clean))return false;try{return totp.decodeBase32(clean).length>=10}catch{return false}}
function requiredStaffEmails(env=process.env,members=[]){
 const owners=new Set([normalize(PRIMARY_OWNER_EMAIL),...list(env.OWNER_EMAILS)]),targets=new Set();
 const add=email=>{const normalized=normalize(email);if(normalized&&!owners.has(normalized))targets.add(normalized)};
 for(const email of list(env.ADMIN_EMAILS))add(email);
 for(const name of['COMPLIANCE_EMAILS','MANAGER_EMAILS','OPERATOR_EMAILS','SUPPORT_EMAILS'])for(const email of list(env[name]))add(email);
 for(const [email,permissions] of Object.entries(rolesConfig(env)))if(Array.isArray(permissions)&&permissions.length)add(email);
 for(const member of members||[])if(member?.active!==false&&member?.role&&member.role!=='client'&&member.role!=='owner')add(member.email);
 return[...targets].sort();
}
function configuredSecret(email,user,env=process.env){
 if(user?.mfaSecretEncrypted){const secret=totp.secretFor(email,user);return validSecret(secret)}
 return validSecret(envSecretFor(email,env));
}
async function status(env=process.env){
 const required=String(env.REQUIRE_STAFF_MFA||'').toLowerCase()==='true';
 if(!required)return{required:false,ready:false,targets:[],missing:[]};
 const members=await directory.list().catch(()=>[]),targets=requiredStaffEmails(env,members),missing=[];
 for(const email of targets){const user=await usuarios.lee(email).catch(()=>null);if(!user||!configuredSecret(email,user,env))missing.push(email)}
 return{required:true,ready:missing.length===0,targets,missing};
}
module.exports={status,_test:{rolesConfig,secretMap,envSecretFor,validSecret,requiredStaffEmails,configuredSecret}};
