'use strict';
const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');
const usuarios = require('./usuarios');
async function verifyUserToken(token,options={}){
 if(!secretConfigured())throw new Error('Sesiones no configuradas');
 const claims=verifyJWT(token),email=String(claims.email||'').toLowerCase();if(!email)throw new Error('Token sin usuario');
 const user=await usuarios.lee(email);
 if(!user&&options.requireUser!==false)throw new Error('Usuario no encontrado');
 if(user){const validAfter=Number(user.tokensValidAfter||0),issuedAt=Number(claims.iat||0);if(validAfter&&(!issuedAt||issuedAt<validAfter))throw new Error('Sesión revocada')}
 return{claims,user:user||null,email};
}
async function verifyEventSession(event,options={}){const token=tokenFromHeader(event.headers||{});if(!token)throw new Error('Token ausente');return verifyUserToken(token,options)}
module.exports={verifyUserToken,verifyEventSession};