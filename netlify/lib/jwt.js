/**
 * netlify/lib/jwt.js — NUTRETIUM
 * Firma y verificación de JWT (HS256) sin dependencias externas.
 */
'use strict';
const crypto = require('crypto');
const MIN_SECRETO = 32;
function secretConfigured(){const s=process.env.JWT_SECRET;return typeof s==='string'&&s.length>=MIN_SECRETO}
function getSecret(){const secret=process.env.JWT_SECRET;if(!secret)throw new Error('JWT_SECRET no está configurado: las sesiones están deshabilitadas.');if(secret.length<MIN_SECRETO)throw new Error(`JWT_SECRET es demasiado corto (mínimo ${MIN_SECRETO} caracteres).`);return secret}
function base64url(buf){return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}
function signJWT(payload,secret=getSecret()){
  const now=Math.floor(Date.now()/1000);
  const normalized={iat:now,...payload};
  const header=base64url(Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const body=base64url(Buffer.from(JSON.stringify(normalized)));
  const sig=base64url(crypto.createHmac('sha256',secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
function verifyJWT(token,secret=getSecret()){
  const [header,body,sig]=String(token||'').split('.');
  if(!header||!body||!sig)throw new Error('Token malformado');
  const expected=base64url(crypto.createHmac('sha256',secret).update(`${header}.${body}`).digest());
  const a=Buffer.from(sig),b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error('Firma inválida');
  const claims=JSON.parse(Buffer.from(body,'base64').toString());
  if(claims.exp&&Math.floor(Date.now()/1000)>claims.exp)throw new Error('Token expirado');
  return claims;
}
function tokenFromHeader(headers={}){const raw=headers.authorization||headers.Authorization||'';const m=/^Bearer\s+(.+)$/i.exec(raw);return m?m[1].trim():null}
module.exports={signJWT,verifyJWT,getSecret,secretConfigured,tokenFromHeader};