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

// El entorno se prepara ANTES de cargar nada: las funciones leen process.env al
// atenderse, pero cors.js fija su origen al cargarse.
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres-de-sobra';
process.env.URL = 'https://nutretium.com';
process.env.GITHUB_REPO = 'appnutretium-hub/Nutretium';
process.env.GITHUB_BRANCH = 'main';

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

let subido = null;   // lo que se habría enviado a GitHub

// `catalogo` se puede cambiar para encadenar dos publicaciones: la segunda
// tiene que ver lo que dejó la primera, que es donde estaba el fallo de las
// fotos que se borraban solas.
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

// La función se carga una vez; lee el entorno en cada llamada.
const { handler } = require('../netlify/functions/admin-catalogo');

async function llama(cuerpo, { token, metodo = 'POST' } = {}) {
  const respuesta = await handler({
    httpMethod: metodo,
    headers: token ? { authorization: 'Bearer ' + token } : {},
    body: JSON.stringify(cuerpo),
  });
  return { estado: respuesta.statusCode, datos: JSON.parse(respuesta.body || '{}') };
}

// El catálogo tal cual, en el formato que manda el panel.
function listaActual(texto = CATALOGO) {
  const { productos } = hoja.parsea(texto);
  return productos.map((p) => ({
    codigo: p.code, nombre: p.name, categoria: p.category, precio: Number(p.price),
    stock: p.stock, activo: p.active !== false, destacado: p.featured === true,
    etiqueta: p.badge || '', marca: p.brand || '', foto: p.image || '',
  }));
}

// ── Pruebas ─────────────────────────────────────────────────────────────────

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

    // Sin token de GitHub no se publica: se falla cerrado, como el resto.
    montaGitHub();
    delete process.env.GITHUB_TOKEN;
    const lista = listaActual();
    lista[0].precio = 19.99;
    const sinToken = await llama({ action: 'publicar', productos: lista }, { token });
    comprueba('sin GITHUB_TOKEN no se publica', sinToken.estado === 503, String(sinToken.estado));

    process.env.GITHUB_TOKEN = 'token-falso';

    // Un cambio correcto sube un solo commit con el catálogo dentro.
    montaGitHub();
    const conCambio = await llama({ action: 'publicar', productos: lista }, { token });
    comprueba('un cambio de precio se publica', conCambio.estado === 200 && conCambio.datos.ok === true,
      JSON.stringify(conCambio.datos).slice(0, 200));
    comprueba('un solo commit', subido.commits.length === 1);
    comprueba('con un solo archivo: el catálogo',
      subido.arboles[0].tree.length === 1 && subido.arboles[0].tree[0].path === 'products-data.js');
    comprueba('el precio nuevo va dentro',
      subido.blobs[0].content.includes('"price":19.99'));
    comprueba('el mensaje del commit dice quién lo hizo',
      subido.commits[0].message.includes(ADMIN));
    comprueba('no se empuja con force', subido.refs[0].force === false);

    // Una hoja con errores no llega a GitHub.
    montaGitHub();
    const mala = listaActual();
    mala[0].precio = 0;
    const conError = await llama({ action: 'publicar', productos: mala }, { token });
    comprueba('un precio a cero no se publica', conError.estado === 400 && conError.datos.ok === false);
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);

    // El nombre con etiquetas HTML tampoco: acabaría dentro de la página.
    montaGitHub();
    const conHtml = listaActual();
    conHtml[0].nombre = 'Bowl <img src=x onerror=alert(1)>';
    const conInyeccion = await llama({ action: 'publicar', productos: conHtml }, { token });
    comprueba('un nombre con HTML no se publica', conInyeccion.estado === 400);
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);

    // Sin cambios no se hace un commit vacío.
    montaGitHub();
    const igual = await llama({ action: 'publicar', productos: listaActual() }, { token });
    comprueba('sin cambios no se hace commit', igual.datos.sinCambios === true && subido.commits.length === 0);

    // El ensayo nunca escribe.
    montaGitHub();
    const ensayo = await llama({ action: 'ensayo', productos: lista }, { token });
    comprueba('el ensayo devuelve el informe', ensayo.estado === 200 && ensayo.datos.informe.cambios.length === 1);
    comprueba('el ensayo no toca GitHub', subido.commits.length === 0);
  }

  console.log('\n── Fotos ──');
  {
    process.env.ADMIN_EMAILS = ADMIN;
    process.env.GITHUB_TOKEN = 'token-falso';
    const token = tokenDe(ADMIN);
    const imagen = Buffer.from('imagen-de-prueba').toString('base64');

    montaGitHub();
    const lista = listaActual();
    const conFoto = await llama({
      action: 'publicar', productos: lista,
      fotos: [{ codigo: '00347', extension: 'webp', base64: imagen }],
    }, { token });

    comprueba('una foto sola ya es motivo de publicación', conFoto.estado === 200 && conFoto.datos.ok === true,
      JSON.stringify(conFoto.datos).slice(0, 200));

    const rutas = subido.arboles[0].tree.map((t) => t.path);
    comprueba('la ruta la calcula el servidor, no el navegador',
      rutas.includes('sources/productos/BEBIDAS/00347__MILKSHAKE_BANANA_330ML_BAREBELLS.webp'),
      rutas.join(', '));
    comprueba('catálogo y foto van en el MISMO commit',
      rutas.includes('products-data.js') && subido.commits.length === 1);
    comprueba('el catálogo ya apunta a la foto',
      subido.blobs.some((b) => b.content.includes('00347__MILKSHAKE_BANANA_330ML_BAREBELLS.webp')));

    // El navegador no puede calcular la ruta, así que el servidor se la
    // devuelve. Sin esto la lista del panel se quedaba con la foto vacía y la
    // SIGUIENTE publicación borraba el enlace recién hecho: el .webp se quedaba
    // en el repositorio y la ficha volvía a salir sin foto. Pasó 18 veces.
    comprueba('publicar devuelve la ruta de cada foto',
      Array.isArray(conFoto.datos.fotos) && conFoto.datos.fotos.length === 1 &&
      conFoto.datos.fotos[0].codigo === '00347' &&
      conFoto.datos.fotos[0].ruta === 'sources/productos/BEBIDAS/00347__MILKSHAKE_BANANA_330ML_BAREBELLS.webp',
      JSON.stringify(conFoto.datos.fotos));

    // La segunda publicación, con el panel al día como lo deja el arreglo.
    const publicado = subido.blobs.find((b) => b.encoding === 'utf-8').content;
    const comoQuedaElPanel = lista.map((p) => {
      const devuelta = (conFoto.datos.fotos || []).find((f) => f.codigo === p.codigo);
      return devuelta ? Object.assign({}, p, { foto: devuelta.ruta }) : p;
    });

    montaGitHub({ catalogo: publicado });
    const segunda = await llama({ action: 'publicar', productos: comoQuedaElPanel }, { token });
    comprueba('y publicar otra vez ya no borra esa foto',
      segunda.datos.sinCambios === true && subido.commits.length === 0,
      JSON.stringify(segunda.datos.informe && segunda.datos.informe.cambios));

    // Una foto de un producto que no viene en la lista no tiene dónde ir.
    montaGitHub();
    const huerfana = await llama({
      action: 'publicar', productos: lista,
      fotos: [{ codigo: 'NO-EXISTE', extension: 'webp', base64: imagen }],
    }, { token });
    comprueba('una foto sin producto: 400', huerfana.estado === 400, String(huerfana.estado));
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);

    montaGitHub();
    const formatoRaro = await llama({
      action: 'publicar', productos: lista,
      fotos: [{ codigo: '00347', extension: 'exe', base64: imagen }],
    }, { token });
    comprueba('una «foto» .exe: 400', formatoRaro.estado === 400, String(formatoRaro.estado));

    // La tanda entera de una vez. Quien lleva la tienda no usa la consola: sube
    // todas las fotos por el panel y publica UNA vez. El tope anterior de 12
    // obligaba a publicar ocho veces, y cada publicación es un despliegue
    // entero — así se agotó la cuota de Netlify (30 despliegues, 30 fotos).
    const sinFoto = hoja.parsea(CATALOGO).productos.filter((p) => !p.image);
    const deTope = Buffer.alloc(35 * 1024, 7).toString('base64');   // el MAX_KB del panel

    montaGitHub();
    const tanda = await llama({
      action: 'publicar', productos: listaActual(),
      fotos: sinFoto.map((p) => ({ codigo: p.code, extension: 'webp', base64: deTope })),
    }, { token });

    comprueba(`las ${sinFoto.length} fotos que faltan entran en UNA sola publicación`,
      tanda.estado === 200 && tanda.datos.ok === true,
      JSON.stringify(tanda.datos).slice(0, 200));
    comprueba('y salen en un único commit',
      subido.commits.length === 1 &&
      subido.arboles[0].tree.filter((t) => t.path.endsWith('.webp')).length === sinFoto.length,
      'commits: ' + subido.commits.length);

    // Pero el envío sigue teniendo un techo: Netlify corta a 6 MB.
    montaGitHub();
    const demasiado = Buffer.alloc(60 * 1024, 7).toString('base64');
    const pasada = await llama({
      action: 'publicar', productos: listaActual(),
      fotos: sinFoto.map((p) => ({ codigo: p.code, extension: 'webp', base64: demasiado })),
    }, { token });
    comprueba('una tanda que no cabe en el envío: 400', pasada.estado === 400, String(pasada.estado));
    comprueba('y el mensaje dice cuántas han entrado',
      /Han entrado \d+ de \d+/.test(pasada.datos.error || ''), pasada.datos.error);
    comprueba('y no se ha tocado GitHub', subido.commits.length === 0);
  }

  console.log('\n── La lista de no vendibles manda también aquí ──');
  {
    process.env.ADMIN_EMAILS = ADMIN;
    process.env.GITHUB_TOKEN = 'token-falso';
    montaGitHub();

    const lista = listaActual();
    lista.push({
      codigo: '00514', nombre: 'Coca-cola Normal', categoria: 'Bebidas', precio: 1.5,
      stock: 30, activo: true, destacado: false, etiqueta: '', marca: 'Coca-cola', foto: '',
    });
    const conVetado = await llama({ action: 'ensayo', productos: lista }, { token: tokenDe(ADMIN) });
    comprueba('un vetado añadido desde el panel no entra',
      conVetado.datos.informe.excluidos.some((e) => e.codigo === '00514'));
    comprueba('y no cuenta como alta', conVetado.datos.informe.altas.length === 0);
  }

  console.log('\n── Cuando GitHub dice que no ──');
  {
    process.env.ADMIN_EMAILS = ADMIN;
    process.env.GITHUB_TOKEN = 'token-falso';
    montaGitHub({ fallaAl: '/git/refs/heads/' });

    const lista = listaActual();
    lista[0].precio = 21.5;
    const rechazado = await llama({ action: 'publicar', productos: lista }, { token: tokenDe(ADMIN) });
    comprueba('el fallo de GitHub se cuenta, no se traga', rechazado.estado === 500);
    comprueba('y el mensaje sirve de algo',
      /permiso|token/i.test(rechazado.datos.error || ''), rechazado.datos.error);
  }

  console.log(`\n${correctas} correctas, ${fallidas} fallidas.`);
  if (fallidas) {
    console.log('\nEsto es lo que separa el catálogo de internet: no lo dejes en rojo.');
    process.exitCode = 1;
  }
})().catch((err) => {
  console.error('\nLa prueba se rompió:', err);
  process.exitCode = 1;
});
