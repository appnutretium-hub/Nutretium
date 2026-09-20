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
function decodeJsonPart(value,label){
  let parsed;
  try{parsed=JSON.parse(Buffer.from(String(value),'base64url').toString('utf8'))}catch{throw new Error(`${label} JWT no válido`)}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(`${label} JWT no válido`);
  return parsed;
}
function signJWT(payload,secret=getSecret()){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Payload JWT no válido');
  const now=Math.floor(Date.now()/1000);
  // iat siempre lo decide el servidor; un llamador no puede retrocederlo para
  // esquivar la revocación por tokensValidAfter.
  const normalized={...payload,iat:now};
  const header=base64url(Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const body=base64url(Buffer.from(JSON.stringify(normalized)));
  const sig=base64url(crypto.createHmac('sha256',secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
function verifyJWT(token,secret=getSecret()){
  const parts=String(token||'').split('.');
  if(parts.length!==3||parts.some(part=>!part))throw new Error('Token malformado');
  const [headerPart,body,sig]=parts;
  const header=decodeJsonPart(headerPart,'Cabecera');
  if(header.alg!=='HS256'||header.typ!=='JWT')throw new Error('Cabecera JWT no permitida');
  const expected=base64url(crypto.createHmac('sha256',secret).update(`${headerPart}.${body}`).digest());
  const a=Buffer.from(sig),b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error('Firma inválida');
  const claims=decodeJsonPart(body,'Payload');
  const now=Math.floor(Date.now()/1000);
  if(claims.exp!==undefined){const exp=Number(claims.exp);if(!Number.isFinite(exp)||now>=exp)throw new Error('Token expirado')}
  if(claims.iat!==undefined&&!Number.isFinite(Number(claims.iat)))throw new Error('Token con iat no válido');
  return claims;
}
function tokenFromHeader(headers={}){const raw=headers.authorization||headers.Authorization||'';const m=/^Bearer\s+(.+)$/i.exec(raw);return m?m[1].trim():null}
module.exports={signJWT,verifyJWT,getSecret,secretConfigured,tokenFromHeader};