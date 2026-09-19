'use strict';
const crypto=require('crypto');
function secret(){return String(process.env.GUEST_ORDER_SECRET||process.env.JWT_SECRET||'')}
function validSecret(){return secret().length>=32}
function tokenFor(order,email){if(!validSecret())return null;return crypto.createHmac('sha256',secret()).update(`${String(order)}|${String(email).toLowerCase()}`).digest('base64url')}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function verify(order,email,token){const expected=tokenFor(order,email);return Boolean(expected&&safeEqual(expected,token))}
module.exports={tokenFor,verify,validSecret};