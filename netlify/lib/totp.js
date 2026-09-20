'use strict';
const crypto=require('crypto');const {getBlobStore}=require('./blob-store');const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',STORE='staff-totp-v1';
function decodeBase32(input){const clean=String(input||'').toUpperCase().replace(/[^A-Z2-7]/g,'');let bits='';for(const c of clean){const v=ALPHABET.indexOf(c);if(v<0)throw new Error('Secret TOTP no válido');bits+=v.toString(2).padStart(5,'0')}const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(bytes)}
function encodeBase32(buf){let bits='';for(const b of buf)bits+=b.toString(2).padStart(8,'0');let out='';for(let i=0;i<bits.length;i+=5){const chunk=bits.slice(i,i+5).padEnd(5,'0');out+=ALPHABET[parseInt(chunk,2)]}return out}
function generateSecret(){return encodeBase32(crypto.randomBytes(20))}
function code(secret,time=Date.now(),step=30,digits=6){const counter=Math.floor(time/1000/step),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',decodeBase32(secret)).update(buf).digest(),offset=h[h.length-1]&15,value=((h[offset]&127)<<24)|(h[offset+1]<<16)|(h[offset+2]<<8)|h[offset+3];return String(value%(10**digits)).padStart(digits,'0')}
function verify(secret,input,time=Date.now()){const given=String(input||'').replace(/\s/g,'');if(!/^\d{6}$/.test(given))return false;for(const drift of[-30000,0,30000]){const expected=code(secret,time+drift),a=Buffer.from(given),b=Buffer.from(expected);if(a.length===b.length&&crypto.timingSafeEqual(a,b))return true}return false}
function envSecrets(){try{const parsed=JSON.parse(process.env.STAFF_TOTP_SECRETS||'{}');return parsed&&typeof parsed==='object'?parsed:{}}catch{return{}}}
function envSecretFor(email){const map=envSecrets(),key=Object.keys(map).find(k=>k.toLowerCase()===String(email||'').toLowerCase());return key?String(map[key]||''):''}
function key(email){return 'user/'+crypto.createHash('sha256').update(String(email||'').trim().toLowerCase()).digest('hex')}
async function secretFor(email){const env=envSecretFor(email);if(env)return env;const st=getBlobStore(STORE);if(!st)return'';const row=await st.get(key(email),{type:'json',consistency:'strong'}).catch(()=>null);return String(row?.secret||'')}
async function saveSecret(email,secret){const st=getBlobStore(STORE);if(!st)throw new Error('Almacenamiento MFA no disponible');await st.setJSON(key(email),{secret:String(secret),enrolledAt:new Date().toISOString()});return true}
function otpauth(email,secret){return 'otpauth://totp/'+encodeURIComponent('Nutretium:'+String(email).toLowerCase())+'?secret='+encodeURIComponent(secret)+'&issuer=Nutretium&algorithm=SHA1&digits=6&period=30'}
module.exports={decodeBase32,encodeBase32,generateSecret,code,verify,secretFor,saveSecret,otpauth};
