'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='admin-config-secrets-v1';
const SERVICE_KEYS={payment:'payment',resend:'integration-resend',tpvsol:'integration-tpvsol'};
const SERVICE_FIELDS={payment:['merchantCode','secretKey'],resend:['apiKey'],tpvsol:['token']};
function master(){const seed=String(process.env.CONFIG_VAULT_KEY||'').trim();if(!seed)return null;return crypto.createHash('sha256').update(`nutretium-config-vault:v1:${seed}`).digest()}
function configured(){return Boolean(master()&&getBlobStore(STORE))}
function seal(value){const key=master();if(!key)throw new Error('vault key unavailable');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const plain=Buffer.from(JSON.stringify(value),'utf8'),data=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();return{v:1,alg:'AES-256-GCM',iv:iv.toString('base64'),tag:tag.toString('base64'),data:data.toString('base64'),updatedAt:new Date().toISOString()}}
function open(record){const key=master();if(!key||!record||record.v!==1)return null;try{const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));decipher.setAuthTag(Buffer.from(record.tag,'base64'));const plain=Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]);const parsed=JSON.parse(plain.toString('utf8'));return parsed&&typeof parsed==='object'?parsed:null}catch{return null}}
function assertService(service){const key=SERVICE_KEYS[service];if(!key)throw Object.assign(new Error('unsupported secret service'),{code:'INVALID_SERVICE'});return key}
async function readSecret(service){const key=assertService(service),s=getBlobStore(STORE);if(!s)return null;const record=await s.get(key,{type:'json',consistency:'strong'}).catch(()=>null);return open(record)}
async function secretStatus(service){assertService(service);const value=await readSecret(service);const fields=SERVICE_FIELDS[service]||[];const status={vaultConfigured:configured(),dedicatedKeyConfigured:Boolean(master()),updatedAt:value?.updatedAt||null};for(const field of fields)status[`${field}Configured`]=Boolean(value?.[field]);status.credentialsConfigured=fields.every(field=>Boolean(value?.[field]));return status}
async function writeSecret(service,input={}){const key=assertService(service),s=getBlobStore(STORE);if(!s||!master())throw Object.assign(new Error('vault unavailable'),{code:'UNAVAILABLE'});const fields=SERVICE_FIELDS[service]||[],current=await readSecret(service)||{},next={updatedAt:new Date().toISOString()};for(const field of fields){const max=field==='apiKey'||field==='token'||field==='secretKey'?1024:64;next[field]=String(input[field]||current[field]||'').trim().slice(0,max)}if(fields.some(field=>!next[field]))throw Object.assign(new Error('missing credentials'),{code:'INVALID'});await s.setJSON(key,seal(next));const verify=await readSecret(service);if(!verify||fields.some(field=>verify[field]!==next[field]))throw Object.assign(new Error('vault verification failed'),{code:'VERIFY'});return secretStatus(service)}
async function clearSecret(service){const key=assertService(service),s=getBlobStore(STORE);if(!s)return false;await s.delete(key).catch(()=>{});return true}
async function readPayment(){return readSecret('payment')}
async function paymentStatus(){const s=await secretStatus('payment');return{vaultConfigured:s.vaultConfigured,dedicatedKeyConfigured:s.dedicatedKeyConfigured,merchantCodeConfigured:s.merchantCodeConfigured,secretKeyConfigured:s.secretKeyConfigured,updatedAt:s.updatedAt}}
async function writePayment(input={}){return writeSecret('payment',input)}
async function clearPayment(){return clearSecret('payment')}
module.exports={configured,readSecret,secretStatus,writeSecret,clearSecret,readPayment,paymentStatus,writePayment,clearPayment,_test:{master,seal,open,SERVICE_KEYS,SERVICE_FIELDS}};
