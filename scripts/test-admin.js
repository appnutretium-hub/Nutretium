// Pruebas de seguridad del panel de catálogo online.
// Uso: node scripts/test-admin.js
// Sale con código 1 si algo que separa Internet del catálogo deja de cumplirse.
'use strict';

const path = require('path').join(__dirname, '..') + '/';
const admin = require(path + 'netlify/lib/admin.js');
const jwt = require(path + 'netlify/lib/jwt.js');
const hoja = require(path + 'netlify/lib/catalogo-hoja.js');
const { handler } = require(path + 'netlify/functions/admin-catalogo.js');
const { NUTRETIUM_PRODUCTS, NUTRETIUM_CATEGORIES } = require(path + 'products-data.js');
const CATALOGO = require('fs').readFileSync(path + 'products-data.js', 'utf8');

const ADMIN = 'jefe@nutretium.test';
process.env.JWT_SECRET = 'secreto-de-pruebas-con-longitud-suficiente';

let correctas = 0, fallidas = 0;
function comprueba(nombre, ok, detalle = '') {
  if (ok) { correctas++; console.log('  OK  ' + nombre); }
  else { fallidas++; console.log('  FALLA  ' + nombre); if (detalle) console.log('         ' + detalle); }
}
function tokenDe(email, extra = {}) { return jwt.sign({ email, ...extra }, process.env.JWT_SECRET); }
function evento(body, token) { return { httpMethod:'POST', headers: token ? { authorization:'Bearer '+token } : {}, body: JSON.stringify(body) }; }
async function llama(body, { token } = {}) {
  const r = await handler(evento(body, token));
  return { estado:r.statusCode, datos:JSON.parse(r.body || '{}') };
}
function listaActual() {
  return NUTRETIUM_PRODUCTS.map((p) => ({ codigo:p.code, nombre:p.name, categoria:p.category, precio:p.price, stock:p.stock, activo:p.active!==false, destacado:p.featured===true, etiqueta:p.badge||'', marca:p.brand||'', foto:p.image||'' }));
}

// Mock mínimo de fetch para que netlify/lib/github.js crea que habla con GitHub.
// Guarda lo que se habría subido para poder comprobarlo.
let subido;
function montaGitHub({ fallaAl = '' } = {}) {
  subido = { blobs:[], arboles:[], commits:[], refs:[] };
  global.fetch = async (url, options = {}) => {
    const u = String(url), body = options.body ? JSON.parse(options.body) : null;
    if (fallaAl && u.includes(fallaAl)) return respuesta(403, { message:'sin permiso' });
    if (u.includes('/contents/products-data.js')) return respuesta(200, { content: Buffer.from(CATALOGO).toString('base64'), sha:'catalogo-sha' });
    if (u.includes('/contents/netlify/lib/no-vendibles.js')) {
      const texto = require('fs').readFileSync(path+'netlify/lib/no-vendibles.js','utf8');
      return respuesta(200,{content:Buffer.from(texto).toString('base64'),sha:'vetados-sha'});
    }
    if (u.includes('/git/ref/heads/')) return respuesta(200, { object:{ sha:'cabeza-sha' } });
    if (u.endsWith('/git/commits/cabeza-sha')) return respuesta(200, { tree:{ sha:'arbol-base' } });
    if (u.endsWith('/git/blobs')) { subido.blobs.push(body); return respuesta(201,{sha:'blob-'+subido.blobs.length}); }
    if (u.endsWith('/git/trees')) { subido.arboles.push(body); return respuesta(201,{sha:'arbol-nuevo'}); }
    if (u.endsWith('/git/commits')) { subido.commits.push(body); return respuesta(201,{sha:'commit-nuevo'}); }
    if (u.includes('/git/refs/heads/')) { subido.refs.push(body); return respuesta(200,{}); }
    return respuesta(404,{message:'mock no conoce '+u});
  };
}
function respuesta(status, obj) { return { ok:status>=200&&status<300, status, text:async()=>JSON.stringify(obj) }; }

(async () => {
  console.log('\n── Quién es administrador ──');
  delete process.env.ADMIN_EMAILS;
  comprueba('sin ADMIN_EMAILS no hay administradores', admin.listaAdmins().length===0);
  process.env.ADMIN_EMAILS = ADMIN;
  comprueba('con ADMIN_EMAILS, ese correo lo es', admin.esAdmin(ADMIN));
  comprueba('y ningún otro', !admin.esAdmin('cliente@example.com'));
  comprueba('da igual cómo se escriba', admin.esAdmin('  JEFE@NUTRETIUM.TEST  '));
  comprueba('el rol se calcula, no se pide', admin.rolPara(ADMIN)==='admin' && admin.rolPara('x@y.es')==='client');
  process.env.ADMIN_EMAILS = 'a@x.es, b@x.es';
  comprueba('admite varios separados por comas', admin.esAdmin('b@x.es'));
  comprueba('el correo vacío nunca es administrador', !admin.esAdmin(''));

  console.log('\n── Puerta del panel ──');
  delete process.env.ADMIN_EMAILS;
  let r = await llama({action:'estado'}, {token:tokenDe(ADMIN)});
  comprueba('sin ADMIN_EMAILS el panel está cerrado para todos', r.estado===403);
  process.env.ADMIN_EMAILS = ADMIN;
  r = await llama({action:'estado'});
  comprueba('sin sesión: 401', r.estado===401);
  r = await llama({action:'estado'}, {token:tokenDe('cliente@example.com')});
  comprueba('con la sesión de un cliente: 403', r.estado===403);
  comprueba('y no se le dice quién sí puede', !JSON.stringify(r.datos).includes(ADMIN));
  const malo = jwt.sign({email:ADMIN}, 'otro-secreto-distinto');
  r = await llama({action:'estado'}, {token:malo});
  comprueba('token firmado con otro secreto: 401', r.estado===401);
  const caducado = jwt.sign({email:ADMIN, exp:Math.floor(Date.now()/1000)-10}, process.env.JWT_SECRET);
  r = await llama({action:'estado'}, {token:caducado});
  comprueba('token caducado: 401', r.estado===401);
  const get = await handler({httpMethod:'GET',headers:{},body:''});
  comprueba('solo se atiende POST', get.statusCode===405);
  montaGitHub();
  r = await llama({action:'estado'}, {token:tokenDe(ADMIN)});
  comprueba('con la sesión del administrador: 200', r.estado===200);
  comprueba('y llega el catálogo entero', r.datos.productos.length===NUTRETIUM_PRODUCTS.length);
  comprueba('y la lista de no vendibles', Array.isArray(r.datos.vetados));

  console.log('\n── Publicar ──');
  delete process.env.GITHUB_TOKEN;
  montaGitHub();
  r = await llama({action:'publicar',productos:listaActual()}, {token:tokenDe(ADMIN)});
  comprueba('sin GITHUB_TOKEN no se publica', r.estado===503 || r.estado===500);

  process.env.GITHUB_TOKEN='token-falso';
  montaGitHub();
  let lista=listaActual(); lista[0].precio = Number(lista[0].precio)+1;
  r = await llama({action:'publicar',productos:lista}, {token:tokenDe(ADMIN)});
  comprueba('un cambio de precio se publica', r.estado===200 && r.datos.ok===true, JSON.stringify(r.datos).slice(0,200));
  comprueba('un solo commit', subido.commits.length===1, 'commits: '+subido.commits.length);
  comprueba('con un solo archivo: el catálogo', subido.arboles[0].tree.length===1);
  const textoNuevo = Buffer.from(subido.blobs[0].content, subido.blobs[0].encoding).toString('utf8');
  comprueba('el precio nuevo va dentro', textoNuevo.includes(String(lista[0].precio)));
  comprueba('el mensaje del commit dice quién lo hizo', subido.commits[0].message.includes(ADMIN));
  comprueba('no se empuja con force', subido.refs[0].force===false);

  montaGitHub(); lista=listaActual(); lista[0].precio=0;
  r=await llama({action:'publicar',productos:lista},{token:tokenDe(ADMIN)});
  comprueba('un precio a cero no se publica',r.estado===400); comprueba('y no se ha tocado GitHub',subido.commits.length===0);
  montaGitHub(); lista=listaActual(); lista[0].nombre='<img src=x onerror=alert(1)>';
  r=await llama({action:'publicar',productos:lista},{token:tokenDe(ADMIN)});
  comprueba('un nombre con HTML no se publica',r.estado===400); comprueba('y no se ha tocado GitHub',subido.commits.length===0);
  montaGitHub();
  r=await llama({action:'publicar',productos:listaActual()},{token:tokenDe(ADMIN)});
  comprueba('sin cambios no se hace commit',r.estado===200 && subido.commits.length===0);
  montaGitHub(); lista=listaActual(); lista[0].precio=Number(lista[0].precio)+1;
  r=await llama({action:'ensayo',productos:lista},{token:tokenDe(ADMIN)});
  comprueba('el ensayo devuelve el informe',r.estado===200 && r.datos.informe.cambios.length>0);
  comprueba('el ensayo no toca GitHub',subido.commits.length===0);

  console.log('\n── Fotos ──');
  {
    process.env.ADMIN_EMAILS=ADMIN;process.env.GITHUB_TOKEN='token-falso';
    const sinFoto=hoja.parsea(CATALOGO).productos.filter((p)=>!p.image);
    const deTope=Buffer.alloc(35*1024,7).toString('base64');
    montaGitHub();
    const tanda=await llama({action:'publicar',productos:listaActual(),fotos:sinFoto.map((p)=>({codigo:p.code,extension:'webp',base64:deTope}))},{token:tokenDe(ADMIN)});
    comprueba(`las ${sinFoto.length} fotos que faltan entran en UNA sola publicación`,tanda.estado===200&&tanda.datos.ok===true,JSON.stringify(tanda.datos).slice(0,200));
    comprueba('y salen en un único commit',subido.commits.length===1&&subido.arboles[0].tree.filter((t)=>t.path.endsWith('.webp')).length===sinFoto.length,'commits: '+subido.commits.length);

    // Genera una tanda apenas superior al límite interno de 4 MiB, sin depender
    // del número actual de productos sin foto. Así el test no queda obsoleto
    // cada vez que se incorpora una imagen real al catálogo.
    montaGitHub();
    const bytesPorFoto=Math.ceil((4*1024*1024)/Math.max(sinFoto.length,1))+1024;
    const demasiado=Buffer.alloc(bytesPorFoto,7).toString('base64');
    const pasada=await llama({action:'publicar',productos:listaActual(),fotos:sinFoto.map((p)=>({codigo:p.code,extension:'webp',base64:demasiado}))},{token:tokenDe(ADMIN)});
    comprueba('una tanda que no cabe en el envío: 400',pasada.estado===400,String(pasada.estado));
    comprueba('y el mensaje dice cuántas han entrado',/Han entrado \d+ de \d+/.test(pasada.datos.error||''),pasada.datos.error);
    comprueba('y no se ha tocado GitHub',subido.commits.length===0);
  }

  console.log('\n── La lista de no vendibles manda también aquí ──');
  {
    process.env.ADMIN_EMAILS=ADMIN;process.env.GITHUB_TOKEN='token-falso';montaGitHub();
    const lista=listaActual();lista.push({codigo:'00514',nombre:'Coca-cola Normal',categoria:'Bebidas',precio:1.5,stock:30,activo:true,destacado:false,etiqueta:'',marca:'Coca-cola',foto:''});
    const conVetado=await llama({action:'ensayo',productos:lista},{token:tokenDe(ADMIN)});
    comprueba('un vetado añadido desde el panel no entra',conVetado.datos.informe.excluidos.some((e)=>e.codigo==='00514'));
    comprueba('y no cuenta como alta',conVetado.datos.informe.altas.length===0);
  }

  console.log('\n── Cuando GitHub dice que no ──');
  {
    process.env.ADMIN_EMAILS=ADMIN;process.env.GITHUB_TOKEN='token-falso';montaGitHub({fallaAl:'/git/refs/heads/'});
    const lista=listaActual();lista[0].precio=21.5;
    const rechazado=await llama({action:'publicar',productos:lista},{token:tokenDe(ADMIN)});
    comprueba('el fallo de GitHub se cuenta, no se traga',rechazado.estado===500);
    comprueba('y el mensaje sirve de algo',/permiso|token/i.test(rechazado.datos.error||''),rechazado.datos.error);
  }

  console.log(`\n${correctas} correctas, ${fallidas} fallidas.`);
  if(fallidas){console.log('\nEsto es lo que separa el catálogo de internet: no lo dejes en rojo.');process.exitCode=1;}
})().catch((err)=>{console.error('\nLa prueba se rompió:',err);process.exitCode=1;});
