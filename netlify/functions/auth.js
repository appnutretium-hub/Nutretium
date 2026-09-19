'use strict';
const crypto=require('crypto');
const {cabecerasCORS}=require('../lib/cors');
const {signJWT,secretConfigured}=require('../lib/jwt');
const {verifyUserToken}=require('../lib/session');
const {rolDe}=require('../lib/admin');
const usuarios=require('../lib/usuarios');
const direccion=require('../lib/direccion');
const {getBlobStore}=require('../lib/blob-store');
const CORS=cabecerasCORS('POST, GET, OPTIONS');
const readUser=usuarios.lee,writeUser=usuarios.escribe;
const MAX_NOMBRE=60,MAX_TELEFONO=20,TELEFONO_VALIDO=/^[0-9 +().-]*$/;
const MAX_INTENTOS=5,CASTIGO_MS=15*60*1000,VENTANA_MS=15*60*1000;
const INTENTOS_EN_MEMORIA={};
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.pbkdf2Sync(password,salt,100_000,64,'sha512').toString('hex');return`${salt}:${hash}`}
function verifyPassword(password,stored){try{const[salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;const attempt=crypto.pbkdf2Sync(password,salt,100_000,64,'sha512').toString('hex');const a=Buffer.from(hash,'hex'),b=Buffer.from(attempt,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}}
function revisaFicha({name,surname,phone}){if(!name)return'El nombre es obligatorio.';if(name.length>MAX_NOMBRE)return'El nombre no puede pasar de '+MAX_NOMBRE+' caracteres.';if(surname.length>MAX_NOMBRE)return'Los apellidos no pueden pasar de '+MAX_NOMBRE+' caracteres.';if(phone.length>MAX_TELEFONO)return'El teléfono no puede pasar de '+MAX_TELEFONO+' caracteres.';if(phone&&!TELEFONO_VALIDO.test(phone))return'El teléfono solo puede llevar números, espacios y los signos + ( ) . -';if([name,surname,phone].some(c=>/[<>]/.test(c)))return'Ni el nombre ni los apellidos ni el teléfono pueden llevar «<» ni «>».';return null}
function fichaPublica(user,extra){return Object.assign({id:user.id,name:user.name,surname:user.surname,email:user.email,phone:user.phone,direccion:direccion.normaliza(user.direccion),direccionCompleta:direccion.completa(user.direccion),role:rolDe(user.email)},extra||{})}
async function leeIntentos(email){const store=getBlobStore('auth-intentos');if(store)return(await store.get(email,{type:'json'}).catch(()=>null))||null;return INTENTOS_EN_MEMORIA[email]||null}
async function guardaIntentos(email,datos){const store=getBlobStore('auth-intentos');if(store)await store.setJSON(email,datos);else INTENTOS_EN_MEMORIA[email]=datos}
async function olvidaIntentos(email){const store=getBlobStore('auth-intentos');if(store)await store.delete(email).catch(()=>{});else delete INTENTOS_EN_MEMORIA[email]}
async function esperaPendiente(email){const datos=await leeIntentos(email);if(!datos||!datos.hasta)return 0;const restante=datos.hasta-Date.now();return restante>0?Math.ceil(restante/1000):0}
async function apuntaFallo(email){const ahora=Date.now(),previo=await leeIntentos(email),dentro=previo&&previo.primero&&(ahora-previo.primero)<VENTANA_MS,fallos=(dentro?previo.fallos:0)+1;await guardaIntentos(email,{fallos,primero:dentro?previo.primero:ahora,hasta:fallos>=MAX_INTENTOS?ahora+CASTIGO_MS:0})}
function response(statusCode,payload,headers=CORS){return{statusCode,headers,body:JSON.stringify(payload)}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});
 if(!secretConfigured())return response(503,{error:'El registro y el inicio de sesión no están disponibles ahora mismo.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'Invalid JSON'})}
 if(body.action==='register'){
  const{name,surname='',email,password,phone=''}=body;if(!name||!email||!password)return response(400,{error:'Nombre, email y contraseña son obligatorios.'});if(password.length<8)return response(400,{error:'La contraseña debe tener al menos 8 caracteres.'});
  const ficha={name:name.trim(),surname:surname.trim(),phone:phone.trim()},problemaFicha=revisaFicha(ficha);if(problemaFicha)return response(400,{error:problemaFicha});
  const dir=direccion.normaliza(body.direccion),problemaDir=direccion.revisa(dir);if(problemaDir)return response(400,{error:problemaDir});
  const emailLower=email.toLowerCase().trim();if(await readUser(emailLower))return response(409,{error:'Ya existe una cuenta con ese email.'});
  const id=crypto.randomUUID(),user={id,name:ficha.name,surname:ficha.surname,email:emailLower,phone:ficha.phone,direccion:dir,passwordHash:hashPassword(password),createdAt:new Date().toISOString()};await writeUser(emailLower,user);
  const token=signJWT({sub:id,email:emailLower,exp:Math.floor(Date.now()/1000)+60*60*24*30});return response(201,{user:fichaPublica(user,{token})});
 }
 if(body.action==='login'){
  const{email,password}=body;if(!email||!password)return response(400,{error:'Email y contraseña son obligatorios.'});const emailLower=email.toLowerCase().trim(),espera=await esperaPendiente(emailLower);if(espera>0)return response(429,{error:'Demasiados intentos fallidos. Prueba otra vez dentro de '+Math.ceil(espera/60)+' minutos.'},{...CORS,'Retry-After':String(espera)});
  const user=await readUser(emailLower);if(!user||!verifyPassword(password,user.passwordHash)){await apuntaFallo(emailLower);return response(401,{error:'Email o contraseña incorrectos.'})}await olvidaIntentos(emailLower);
  const token=signJWT({sub:user.id,email:emailLower,exp:Math.floor(Date.now()/1000)+60*60*24*30});return response(200,{user:fichaPublica(user,{token})});
 }
 if(body.action==='profile'){
  if(!body.token)return response(401,{error:'Token requerido.'});let verified;try{verified=await verifyUserToken(body.token)}catch{return response(401,{error:'Token inválido, revocado o expirado.'})}return response(200,{user:fichaPublica(verified.user)});
 }
 if(body.action==='update'){
  if(!body.token)return response(401,{error:'Token requerido.'});let verified;try{verified=await verifyUserToken(body.token)}catch{return response(401,{error:'Token inválido, revocado o expirado.'})}const user=verified.user;
  const ficha={name:String(body.name||'').trim(),surname:String(body.surname||'').trim(),phone:String(body.phone||'').trim()},problema=revisaFicha(ficha);if(problema)return response(400,{error:problema});
  let dir=direccion.normaliza(user.direccion);if(body.direccion!==undefined){dir=direccion.normaliza(body.direccion);const problemaDir=direccion.revisa(dir);if(problemaDir)return response(400,{error:problemaDir})}
  const actualizado={...user,name:ficha.name,surname:ficha.surname,phone:ficha.phone,direccion:dir,updatedAt:new Date().toISOString()};await writeUser(verified.email,actualizado);return response(200,{user:fichaPublica(actualizado)});
 }
 return response(400,{error:'Acción no reconocida.'});
};