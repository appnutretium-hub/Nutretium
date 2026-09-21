'use strict';
const crypto=require('crypto');
const MAX_SKEW_SECONDS=300;
function secret(){return String(process.env.JWT_SECRET||'').trim();}
function sign(purpose,timestamp,body=''){const key=secret();if(!key)return'';return crypto.createHmac('sha256',key).update(`${timestamp}.${purpose}.${body}`).digest('hex');}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function headers(purpose,body=''){const timestamp=String(Math.floor(Date.now()/1000));return{'X-Nutretium-Internal-Timestamp':timestamp,'X-Nutretium-Internal-Signature':sign(purpose,timestamp,body)};}
function verify(event,purpose,body=''){
 const key=secret();if(!key)return{ok:false,error:'internal-auth-unconfigured'};
 const h=event?.headers||{},timestamp=String(h['x-nutretium-internal-timestamp']||h['X-Nutretium-Internal-Timestamp']||''),provided=String(h['x-nutretium-internal-signature']||h['X-Nutretium-Internal-Signature']||'');
 const seconds=Number(timestamp);if(!Number.isFinite(seconds)||Math.abs(Date.now()/1000-seconds)>MAX_SKEW_SECONDS)return{ok:false,error:'internal-auth-expired'};
 const expected=sign(purpose,timestamp,body);return safeEqual(provided,expected)?{ok:true}:{ok:false,error:'internal-auth-invalid'};
}
module.exports={MAX_SKEW_SECONDS,sign,safeEqual,headers,verify};
