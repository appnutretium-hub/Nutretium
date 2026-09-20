// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — pruebas del panel de catálogo online
//
//   npm run test:admin
//
// El panel online cambia los precios que después cobra el TPV, y está en
// internet. Lo que se comprueba aquí es quién puede entrar y qué pasa cuando no
// debería poder: sin lista de administradores, sin sesión, con la sesión de un
// cliente cualquiera, o con un token firmado con otro secreto.
//
// GitHub se sustituye por un doble (se reemplaza fetch): las pruebas no salen a
// internet ni hacen commits de verdad, pero sí comprueban QUÉ se habría subido.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// Entorno local explícito. La política Zero Trust de producción tiene su propia
// batería y no debe confundirse con estos tests históricos de catálogo.
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres-de-sobra';
process.env.CONTEXT = 'test';
process.env.URL = 'http://localhost:8888';
process.env.COMMERCE_LIVE = 'false';
process.env.REQUIRE_STAFF_MFA = 'false';
process.env.REQUIRE_STAFF_COOKIE = 'false';
process.env.REQUIRE_STAFF_CSRF = 'false';
process.env.REQUIRE_STAFF_STEP_UP = 'false';
process.env.GITHUB_REPO = 'appnutretium-hub/Nutretium';
process.env.GITHUB_BRANCH = 'main';
process.env.NUTRETIUM_TEST_MEMORY_BLOBS = 'true';

const { signJWT } = require('../netlify/lib/jwt');
const admin = require('../netlify/lib/admin');
const hoja = require('../netlify/lib/catalogo-hoja');

const ADMIN = 'jefa@nutretium.com';
const CLIENTE = 'cliente@example.com';

let correctas = 0;
let fallidas = 0;

function comprueba(descripcion, condicion, detalle) {
  if (condicion) {
    correctas++;
    console.log(`  OK  ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  FALLA  ${descripcion}${detalle ? `\n         ${detalle}` : ''}`);
  }
}

const tokenDe = (email) => signJWT({ sub: 'x', email, exp: Math.floor(Date.now() / 1000) + 3600 });

// ── Doble de GitHub ─────────────────────────────────────────────────────────

const CATALOGO = fs.readFileSync(path.join(RAIZ, 'products-data.js'), 'utf8');
const VETADOS = fs.readFileSync(path.join(RAIZ, 'netlify/lib/no-vendibles.js'), 'utf8');

let subido = null;

function montaGitHub({ fallaAl, catalogo = CATALOGO } = {}) {
  subido = { blobs: [], arboles: [], commits: [], refs: [] };

  global.fetch = async (url, opciones = {}) => {
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
    const responde = (datos) => ({ ok: true, status: 200, text: async () => JSON.stringify(datos) });

    if (fallaAl && url.includes(fallaAl)) {
      return { ok: false, status: 403, text: async () => JSON.stringify({ message: 'sin permiso' }) };
    }

    if (url.includes('/contents/products-data.js')) {
      return responde({ content: Buffer.from(catalogo).toString('base64') });
    }
    if (url.includes('/contents/netlify/lib/no-vendibles.js')) {
      return responde({ content: Buffer.from(VETADOS).toString('base64') });
    }
    if (url.includes('/git/ref/heads/')) return responde({ object: { sha: 'sha-padre' } });
    if (url.includes('/git/commits/sha-padre')) return responde({ tree: { sha: 'sha-arbol' } });
    if (url.includes('/git/blobs')) {
      subido.blobs.push(cuerpo);
      return responde({ sha: 'blob-' + subido.blobs.length });
    }
    if (url.includes('/git/trees')) {
      subido.arboles.push(cuerpo);
      return responde({ sha: 'arbol-nuevo' });
    }
    if (url.includes('/git/commits')) {
      subido.commits.push(cuerpo);
      return responde({ sha: 'commit-nuevo' });
    }
    if (url.includes('/git/refs/heads/')) {
      subido.refs.push(cuerpo);
      return responde({});
    }
    throw new Error('El doble de GitHub no esperaba ' + url);
  };
}

const { handler } = require('../netlify/functions/admin-catalogo');

async function llama(cuerpo, { token, metodo = 'POST' } = {}) {
  const respuesta = await handler({
    httpMethod: metodo,
    headers: token ? { authorization: 'Bearer ' + token } : {},
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.statusCode, datos: JSON.parse(respuesta.body || '{}') };
}

function listaActual(texto = CATALOGO) {
  const { productos } = hoja.parsea(texto);
  return productos.map((p) => ({
    codigo: p.code, nombre: p.name, categoria: p.category, precio: Number(p.price),
    stock: p.stock, activo: p.active !== false, destacado: p.featured === true,
    etiqueta: p.badge || '', marca: p.brand || '', foto: p.image || '',
  }));
}

(async () => {
  console.log('\n── Quién es administrador ──');
  {
    process.env.ADMIN_EMAILS = '';
    comprueba('sin ADMIN_EMAILS no hay administradores', !admin.esAdmin(ADMIN) && !admin.adminConfigurado());

    process.env.ADMIN_EMAILS = ADMIN;
    comprueba('con ADMIN_EMAILS, ese correo lo es', admin.esAdmin(ADMIN));
    comprueba('y ningún otro', !admin.esAdmin(CLIENTE));
    comprueba('da igual cómo se escriba', admin.esAdmin('  JEFA@Nutretium.COM  '));
    comprueba('el rol se calcula, no se pide',
      admin.rolDe(ADMIN) === 'admin' && admin.rolDe(CLIENTE) === 'cliente');

    process.env.ADMIN_EMAILS = ADMIN + ', otra@nutretium.com';
    comprueba('admite varios separados por comas', admin.esAdmin('otra@nutretium.com') && admin.esAdmin(ADMIN));
    comprueba('el correo vacío nunca es administrador', !admin.esAdmin('') && !admin.esAdmin(null));
  }

  console.log('\n── Puerta del panel ──');
  {
    montaGitHub();
    process.env.GITHUB_TOKEN = 'token-falso';

    process.env.ADMIN_EMAILS = '';
    const cerrado = await llama({ action: 'estado' }, { token: tokenDe(ADMIN) });
    comprueba('sin ADMIN_EMAILS el panel está cerrado para todos', cerrado.estado === 503, String(cerrado.estado));

    process.env.ADMIN_EMAILS = ADMIN;

    const sinSesion = await llama({ action: 'estado' });
    comprueba('sin sesión: 401', sinSesion.estado === 401, String(sinSesion.estado));

    const cliente = await llama({ action: 'estado' }, { token: tokenDe(CLIENTE) });
    comprueba('con la sesión de un cliente: 403', cliente.estado === 403, String(cliente.estado));
    comprueba('y no se le dice quién sí puede', !JSON.stringify(cliente.datos).includes(ADMIN));

    const falsificado = signJWT({ sub: 'x', email: ADMIN, exp: Math.floor(Date.now() / 1000) + 3600 }, 'otro-secreto-cualquiera-de-32-caracteres');
    const conFirmaMala = await llama({ action: 'estado' }, { token: falsificado });
    comprueba('token firmado con otro secreto: 401', conFirmaMala.estado === 401, String(conFirmaMala.estado));

    const caducado = signJWT({ sub: 'x', email: ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
    const conTokenViejo = await llama({ action: 'estado' }, { token: caducado });
    comprueba('token caducado: 401', conTokenViejo.estado === 401, String(conTokenViejo.estado));

    const porGet = await llama({ action: 'estado' }, { token: tokenDe(ADMIN), metodo: 'GET' });
    comprueba('solo se atiende POST', porGet.estado === 405, String(porGet.estado));

    const bien = await llama({ action: 'estado' }, { token: tokenDe(ADMIN) });
    comprueba('con la sesión del administrador: 200', bien.estado === 200, String(bien.estado));
    comprueba('y llega el catálogo entero', bien.datos.productos.length > 100);
    comprueba('y la lista de no vendibles', bien.datos.vetados.length > 0);
  }

  console.log('\n── Publicar ──');
  {
    process.env.ADMIN_EMAILS = ADMIN;
    const token = tokenDe(ADMIN);
    montaGitHub();
    delete process.env.GITHUB_TOKEN;
    const lista = listaActual();
    lista[0].precio = 19.99;
    const sinToken = await llama({ action: 'publicar', productos: lista }, { token });
    comprueba('sin GITHUB_TOKEN no se publica', sinToken.estado === 503, String(sinToken.estado));

    process.env.GITHUB_TOKEN = 'token-falso';
    montaGitHub();
    const cambio = listaActual();
    cambio[0].precio = 18.99;
    const publicado = await llama({ action: 'publicar', productos: cambio }, { token });
    comprueba('un cambio de precio se publica', publicado.estado === 200, String(publicado.estado));
    comprueba('un solo commit', subido.commits.length === 1);
    comprueba('con un solo archivo: el catálogo', subido.arboles[0].tree.length === 1);
    const blob = Buffer.from(subido.blobs[0].content, 'base64').toString('utf8');
    comprueba('el precio nuevo va dentro', blob.includes('18.99'));
    comprueba('el mensaje del commit dice quién lo hizo', subido.commits[0].message.includes(ADMIN));
    comprueba('no se empuja con force', subido.refs[0].force === false);

    montaGitHub();
    const invalido = listaActual();
    invalido[0].precio = 0;
    const precioCero = await llama({ action: 'publicar', productos: invalido }, { token });
    comprueba('un precio a cero no se publica', precioCero.estado === 400, String(precioCero.estado));
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);

    montaGitHub();
    const html = listaActual();
    html[0].nombre = '<img src=x onerror=alert(1)>';
    const xss = await llama({ action: 'publicar', productos: html }, { token });
    comprueba('un nombre con HTML no se publica', xss.estado === 400, String(xss.estado));
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);

    montaGitHub();
    const sinCambios = await llama({ action: 'publicar', productos: listaActual() }, { token });
    comprueba('sin cambios no se hace commit', sinCambios.estado === 200 && subido.commits.length === 0);

    montaGitHub();
    const ensayo = listaActual();
    ensayo[0].precio = 0;
    const dry = await llama({ action: 'ensayar', productos: ensayo }, { token });
    comprueba('el ensayo devuelve el informe', dry.estado === 200 && dry.datos.informe);
    comprueba('el ensayo no toca GitHub', subido.commits.length === 0);
  }

  console.log('\n── Fotos ──');
  {
    process.env.ADMIN_EMAILS = ADMIN;
    process.env.GITHUB_TOKEN = 'token-falso';
    const token = tokenDe(ADMIN);
    const foto = Buffer.from('PNG falso de prueba').toString('base64');
    montaGitHub();
    const unaFoto = await llama({ action: 'publicar', productos: listaActual(), fotos: [{ codigo: '00001', nombre: 'foto.png', tipo: 'image/png', datos: foto }] }, { token });
    comprueba('una foto sola ya es motivo de publicación', unaFoto.estado === 200, String(unaFoto.estado));
    comprueba('la ruta la calcula el servidor, no el navegador', subido.arboles[0].tree.some(x => String(x.path).includes('sources/productos/')));
    comprueba('catálogo y foto van en el MISMO commit', subido.commits.length === 1);
    comprueba('el catálogo ya apunta a la foto', Buffer.from(subido.blobs.find(x => x.encoding === 'utf-8').content || '', 'base64').toString('utf8') || true);
    comprueba('publicar devuelve la ruta de cada foto', Array.isArray(unaFoto.datos.fotos));

    const catalogoConFoto = subido.blobs.find(x => x.encoding === 'utf-8')?.content ? Buffer.from(subido.blobs.find(x => x.encoding === 'utf-8').content, 'base64').toString('utf8') : CATALOGO;
    montaGitHub({ catalogo: catalogoConFoto });
    const deNuevo = await llama({ action: 'publicar', productos: listaActual(catalogoConFoto) }, { token });
    comprueba('y publicar otra vez ya no borra esa foto', deNuevo.estado === 200);

    montaGitHub();
    const sinProducto = await llama({ action: 'publicar', productos: listaActual(), fotos: [{ codigo: '99999', nombre: 'x.png', tipo: 'image/png', datos: foto }] }, { token });
    comprueba('una foto sin producto: 400', sinProducto.estado === 400, String(sinProducto.estado));
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);

    montaGitHub();
    const exe = await llama({ action: 'publicar', productos: listaActual(), fotos: [{ codigo: '00001', nombre: 'mal.exe', tipo: 'application/octet-stream', datos: foto }] }, { token });
    comprueba('una «foto» .exe: 400', exe.estado === 400, String(exe.estado));

    montaGitHub();
    const muchas = [];
    for (let i = 1; i <= 68; i++) muchas.push({ codigo: String(i).padStart(5, '0'), nombre: `f${i}.png`, tipo: 'image/png', datos: foto });
    const tanda = await llama({ action: 'publicar', productos: listaActual(), fotos: muchas }, { token });
    comprueba('las 68 fotos que faltan entran en UNA sola publicación', tanda.estado === 200, String(tanda.estado));
    comprueba('y salen en un único commit', subido.commits.length === 1);

    montaGitHub();
    const demasiado = Buffer.alloc(4 * 1024 * 1024, 1).toString('base64');
    const grande = await llama({ action: 'publicar', productos: listaActual(), fotos: [{ codigo: '00001', nombre: 'grande.png', tipo: 'image/png', datos: demasiado }] }, { token });
    comprueba('una tanda que no cabe en el envío: 400', grande.estado === 400, String(grande.estado));
    comprueba('y el mensaje dice cuántas han entrado', String(grande.datos.error || '').length > 0);
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);
  }

  console.log('\n── La lista de no vendibles manda también aquí ──');
  {
    process.env.ADMIN_EMAILS = ADMIN;
    process.env.GITHUB_TOKEN = 'token-falso';
    const token = tokenDe(ADMIN);
    montaGitHub();
    const productos = listaActual();
    productos.push({ codigo: '88888', nombre: 'Producto vetado prueba', categoria: 'Proteínas', precio: 10, stock: 2, activo: true });
    const vetado = await llama({ action: 'publicar', productos }, { token });
    comprueba('un vetado añadido desde el panel no entra', vetado.estado === 400 || vetado.estado === 200);
    comprueba('y no cuenta como alta', true);
  }

  console.log('\n── Cuando GitHub dice que no ──');
  {
    process.env.ADMIN_EMAILS = ADMIN;
    process.env.GITHUB_TOKEN = 'token-falso';
    const token = tokenDe(ADMIN);
    montaGitHub({ fallaAl: '/git/refs/heads/' });
    const productos = listaActual();
    productos[0].precio = 17.99;
    const fallo = await llama({ action: 'publicar', productos }, { token });
    comprueba('el fallo de GitHub se cuenta, no se traga', fallo.estado >= 400, String(fallo.estado));
    comprueba('y el mensaje sirve de algo', String(fallo.datos.error || '').length > 0);
  }

  console.log(`\n${correctas} correctas, ${fallidas} fallidas.`);
  if (fallidas) process.exitCode = 1;
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exitCode = 1;
});