'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='admin-config-secrets-v1';
const KEY='payment';
function master(){const seed=String(process.env.CONFIG_VAULT_KEY||process.env.JWT_SECRET||'').trim();if(!seed)return null;return crypto.createHash('sha256').update(`nutretium-config-vault:v1:${seed}`).digest()}
function configured(){return Boolean(master()&&getBlobStore(STORE))}
function seal(value){const key=master();if(!key)throw new Error('vault key unavailable');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const plain=Buffer.from(JSON.stringify(value),'utf8'),data=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();return{v:1,alg:'AES-256-GCM',iv:iv.toString('base64'),tag:tag.toString('base64'),data:data.toString('base64'),updatedAt:new Date().toISOString()}}
function open(record){const key=master();if(!key||!record||record.v!==1)return null;try{const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));decipher.setAuthTag(Buffer.from(record.tag,'base64'));const plain=Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]);const parsed=JSON.parse(plain.toString('utf8'));return parsed&&typeof parsed==='object'?parsed:null}catch{return null}}
async function readPayment(){const s=getBlobStore(STORE);if(!s)return null;const record=await s.get(KEY,{type:'json',consistency:'strong'}).catch(()=>null);return open(record)}
async function paymentStatus(){const value=await readPayment();return{vaultConfigured:configured(),merchantCodeConfigured:Boolean(value?.merchantCode),secretKeyConfigured:Boolean(value?.secretKey),updatedAt:value?.updatedAt||null}}
async function writePayment(input={}){const s=getBlobStore(STORE);if(!s||!master())throw Object.assign(new Error('vault unavailable'),{code:'UNAVAILABLE'});const current=await readPayment()||{};const next={merchantCode:String(input.merchantCode||current.merchantCode||'').trim().slice(0,32),secretKey:String(input.secretKey||current.secretKey||'').trim().slice(0,512),updatedAt:new Date().toISOString()};if(!next.merchantCode||!next.secretKey)throw Object.assign(new Error('missing credentials'),{code:'INVALID'});await s.setJSON(KEY,seal(next));const verify=await readPayment();if(!verify||verify.merchantCode!==next.merchantCode||verify.secretKey!==next.secretKey)throw Object.assign(new Error('vault verification failed'),{code:'VERIFY'});return paymentStatus()}
async function clearPayment(){const s=getBlobStore(STORE);if(!s)return false;await s.delete(KEY).catch(()=>{});return true}
module.exports={configured,readPayment,paymentStatus,writePayment,clearPayment,_test:{master,seal,open}};
