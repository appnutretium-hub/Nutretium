'use strict';
const crypto=require('crypto');
const {cabecerasCORS}=require('../lib/cors');
const {signJWT,secretConfigured}=require('../lib/jwt');
const {verifyUserToken}=require('../lib/session');
const {rolDe}=require('../lib/admin');
const {hashPassword,verifyPassword}=require('../lib/passwords');
const usuarios=require('../lib/usuarios');
const direccion=require('../lib/direccion');
const {consume,reset}=require('../lib/rate-limit');
const CORS=cabecerasCORS('POST, GET, OPTIONS');
const readUser=usuarios.lee;
const MAX_NOMBRE=60,MAX_TELEFONO=20,TELEFONO_VALIDO=/^[0-9 +().-]*$/;
const MAX_INTENTOS=5,VENTANA_MS=15*60*1000;
function revisaFicha({name,surname,phone}){if(!name)return'El nombre es obligatorio.';if(name.length>MAX_NOMBRE)return'El nombre no puede pasar de '+MAX_NOMBRE+' caracteres.';if(surname.length>MAX_NOMBRE)return'Los apellidos no pueden pasar de '+MAX_NOMBRE+' caracteres.';if(phone.length>MAX_TELEFONO)return'El teléfono no puede pasar de '+MAX_TELEFONO+' caracteres.';if(phone&&!TELEFONO_VALIDO.test(phone))return'El teléfono solo puede llevar números, espacios y los signos + ( ) . -';if([name,surname,phone].some(c=>/[<>]/.test(c)))return'Ni el nombre ni los apellidos ni el teléfono pueden llevar «<» ni «>».';return null}
function fichaPublica(user,extra){return Object.assign({id:user.id,name:user.name,surname:user.surname,email:user.email,phone:user.phone,direccion:direccion.normaliza(user.direccion),direccionCompleta:direccion.completa(user.direccion),role:rolDe(user.email)},extra||{})}
function response(statusCode,payload,headers=CORS){return{statusCode,headers,body:JSON.stringify(payload)}}
function customerToken(user,email){return signJWT({sub:user.id,email,kind:'customer',sv:Number(user.sessionVersion||0),exp:Math.floor(Date.now()/1000)+60*60*24*30})}
async function upgradeHashIfNeeded(email,password,user,verification){
 if(!verification.needsRehash)return;
 const upgraded=hashPassword(password),at=new Date().toISOString();
 await usuarios.muta(email,current=>current.passwordHash===user.passwordHash?{...current,passwordHash:upgraded,passwordHashUpgradedAt:at,updatedAt:at}:null).catch(()=>null);
}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});
 if(!secretConfigured())return response(503,{error:'El registro y el inicio de sesión no están disponibles ahora mismo.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'Invalid JSON'})}
 if(body.action==='register'){
  const{name,surname='',email,password,phone=''}=body;if(!name||!email||!password)return response(400,{error:'Nombre, email y contraseña son obligatorios.'});if(password.length<8)return response(400,{error:'La contraseña debe tener al menos 8 caracteres.'});
  const ficha={name:name.trim(),surname:surname.trim(),phone:phone.trim()},problemaFicha=revisaFicha(ficha);if(problemaFicha)return response(400,{error:problemaFicha});
  const dir=direccion.normaliza(body.direccion),problemaDir=direccion.revisa(dir);if(problemaDir)return response(400,{error:problemaDir});
  const emailLower=email.toLowerCase().trim(),id=crypto.randomUUID(),user={id,name:ficha.name,surname:ficha.surname,email:emailLower,phone:ficha.phone,direccion:dir,passwordHash:hashPassword(password),sessionVersion:0,createdAt:new Date().toISOString()};
  let created;try{created=await usuarios.crea(emailLower,user)}catch{return response(503,{error:'No se ha podido crear la cuenta en este momento.'})}
  if(!created)return response(409,{error:'Ya existe una cuenta con ese email.'});
  const token=customerToken(user,emailLower);return response(201,{user:fichaPublica(user,{token})});
 }
 if(body.action==='login'){
  const{email,password}=body;if(!email||!password)return response(400,{error:'Email y contraseña son obligatorios.'});const emailLower=email.toLowerCase().trim();
  const gate=await consume({scope:'login',event,extra:emailLower,limit:MAX_INTENTOS,windowMs:VENTANA_MS});
  if(!gate.allowed){const seconds=Math.max(1,Number(gate.retryAfter)||60);return response(429,{error:`Demasiados intentos. Prueba otra vez dentro de ${Math.max(1,Math.ceil(seconds/60))} minutos.`},{...CORS,'Retry-After':String(seconds)})}
  const user=await readUser(emailLower),verification=user?verifyPassword(password,user.passwordHash):{ok:false,needsRehash:false};if(!user||!verification.ok)return response(401,{error:'Email o contraseña incorrectos.'});
  await upgradeHashIfNeeded(emailLower,password,user,verification);
  await reset({scope:'login',event,extra:emailLower});
  const token=customerToken(user,emailLower);return response(200,{user:fichaPublica(user,{token})});
 }
 if(body.action==='profile'){
  if(!body.token)return response(401,{error:'Token requerido.'});let verified;try{verified=await verifyUserToken(body.token,{requireUser:false})}catch{return response(401,{error:'Token inválido, revocado o expirado.'})}if(!verified.user)return response(404,{error:'Usuario no encontrado.'});return response(200,{user:fichaPublica(verified.user)});
 }
 if(body.action==='update'){
  if(!body.token)return response(401,{error:'Token requerido.'});let verified;try{verified=await verifyUserToken(body.token,{requireUser:false})}catch{return response(401,{error:'Token inválido, revocado o expirado.'})}if(!verified.user)return response(404,{error:'Usuario no encontrado.'});
  const ficha={name:String(body.name||'').trim(),surname:String(body.surname||'').trim(),phone:String(body.phone||'').trim()},problema=revisaFicha(ficha);if(problema)return response(400,{error:problema});
  let requestedDir=null;if(body.direccion!==undefined){requestedDir=direccion.normaliza(body.direccion);const problemaDir=direccion.revisa(requestedDir);if(problemaDir)return response(400,{error:problemaDir})}
  let actualizado;try{actualizado=await usuarios.muta(verified.email,current=>({...current,name:ficha.name,surname:ficha.surname,phone:ficha.phone,direccion:requestedDir||direccion.normaliza(current.direccion),updatedAt:new Date().toISOString()}))}catch{return response(409,{error:'Tu perfil cambió al mismo tiempo desde otra sesión. Inténtalo de nuevo.'})}
  if(!actualizado)return response(404,{error:'Usuario no encontrado.'});return response(200,{user:fichaPublica(actualizado)});
 }
 return response(400,{error:'Acción no reconocida.'});
};

exports._test={upgradeHashIfNeeded,customerToken};