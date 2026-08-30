// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — panel de catálogo (local)
//
//   npm run panel        →  http://localhost:4180
//
// Sirve la MISMA página que el panel online (admin.html), pero hablando con el
// disco en vez de con GitHub: aquí guardar escribe los archivos del proyecto y
// publicar sigue siendo un git push a mano.
//
// La página es la misma a propósito. Dos paneles distintos acabarían como
// acabaron las dos listas de productos que documenta CLAUDE.md: divergiendo.
// Y el validador también es el mismo (netlify/lib/catalogo-hoja.js), así que
// Excel, este panel y el de la tienda aceptan y rechazan exactamente lo mismo.
//
// SOLO LOCAL, y a propósito:
//   · escucha en 127.0.0.1, así que no es accesible desde otro equipo;
//   · no tiene contraseña, porque no está expuesto. El panel de la tienda sí la
//     tiene: ahí manda netlify/lib/admin.js.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const catalogo = require('./catalogo-actualizar.js');
const hoja = require('../netlify/lib/catalogo-hoja.js');
const fotos = require('./fotos-incorporar.js');

const RAIZ = path.join(__dirname, '..');
const PUERTO = Number(process.env.PUERTO_PANEL) || 4180;

// Una foto ya tratada por el navegador ronda los 100 KB; en base64 crece un
// tercio. 30 MB deja margen de sobra y corta en seco lo que no sean fotos.
const MAX_CUERPO = 30 * 1024 * 1024;

const EXTENSIONES = new Set(['webp', 'jpg', 'jpeg', 'png']);

// Los únicos archivos del proyecto que el panel sirve. Lista blanca y no
// carpeta abierta: esto corre con permisos de tu usuario.
const PAGINAS = new Set(['/', '/index.html', '/admin.html', '/admin.js']);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// ── Utilidades de respuesta ─────────────────────────────────────────────────

function json(res, codigo, cuerpo) {
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(cuerpo));
}

function leeCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const trozos = [];
    req.on('data', (t) => {
      total += t.length;
      if (total > MAX_CUERPO) {
        reject(new Error('El envío pasa de ' + Math.round(MAX_CUERPO / 1024 / 1024) + ' MB.'));
        req.destroy();
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}')); }
      catch { reject(new Error('El envío no es JSON válido.')); }
    });
    req.on('error', reject);
  });
}

// ── Lo que ve el panel ──────────────────────────────────────────────────────

function estadoActual() {
  const { productos, categorias } = catalogo.leeCatalogo();
  return {
    modo: 'local',
    puedePublicar: true,
    categorias,
    productos: productos.map((p) => ({
      codigo: p.code,
      nombre: p.name,
      categoria: p.category,
      precio: Number(p.price),
      stock: p.stock,                       // null = «no se controla»
      activo: p.active !== false,
      destacado: p.featured === true,
      etiqueta: p.badge || '',
      marca: p.brand || '',
      foto: p.image || '',
      emoji: p.emoji || '',
    })),
    vetados: catalogo.leeNoVendibles().map((v) => ({ codigo: v.codigo, motivo: v.motivo })),
  };
}

// Traduce lo que manda el navegador al formato de celda de la hoja. Aquí no se
// valida nada: de eso se encarga el validador compartido.
function aFilas(productos) {
  return productos.map((p, i) => ({
    codigo: String(p.codigo ?? '').trim(),
    nombre: String(p.nombre ?? '').trim(),
    categoria: String(p.categoria ?? '').trim(),
    precio: typeof p.precio === 'number' ? hoja.escribePrecio(p.precio) : String(p.precio ?? '').trim(),
    stock: hoja.comoTextoStock(p.stock === '' ? null : p.stock),
    activo: hoja.escribeSiNo(p.activo !== false),
    destacado: hoja.escribeSiNo(p.destacado === true),
    etiqueta: String(p.etiqueta ?? '').trim(),
    marca: String(p.marca ?? '').trim(),
    foto: String(p.foto ?? '').trim(),
    __linea: i + 2,   // el panel enseña «fila N» contando como Excel
  }));
}

function informeParaPantalla(informe) {
  return {
    errores: informe.errores,
    avisos: informe.avisos,
    excluidos: informe.excluidos,
    altas: informe.altas.map((p) => ({ codigo: p.code, nombre: p.name, precio: p.price })),
    bajas: informe.bajas.map((p) => ({ codigo: p.code, nombre: p.name })),
    cambios: informe.cambios.map((c) => ({
      codigo: c.producto.code, nombre: c.producto.name, diferencias: c.diferencias,
    })),
    total: informe.resultado.length,
    totalAntes: informe.anteriores.length,
  };
}

// ── Fotos ───────────────────────────────────────────────────────────────────

/**
 * Coloca cada foto en su sitio y la escribe en la fila de su producto.
 *
 * La ruta la calcula hoja.rutaEsperada(), igual que en el panel online y que en
 * NOMBRES_ESPERADOS.csv: una foto puesta desde el panel cae donde la buscaría
 * scripts/fotos-incorporar.js.
 *
 * Las fotos llegan ya recortadas y encuadradas por el navegador. Para tandas
 * grandes sigue siendo mejor `npm run fotos`, que además recorta el borde
 * sobrante del original con sharp.
 */
function colocaFotos(filas, entrantes) {
  if (!Array.isArray(entrantes) || !entrantes.length) return { archivos: [] };

  const porCodigo = new Map(filas.map((fila) => [String(fila.codigo).toUpperCase(), fila]));
  const archivos = [];

  for (const foto of entrantes) {
    const codigo = String(foto && foto.codigo || '').trim().toUpperCase();
    const extension = String(foto && foto.extension || 'webp').toLowerCase();
    const base64 = String(foto && foto.base64 || '').split(',').pop();

    if (!EXTENSIONES.has(extension)) return { error: 'Formato de foto no admitido: ' + extension + '.' };
    if (!base64) return { error: 'La foto de ' + codigo + ' llegó vacía.' };

    const fila = porCodigo.get(codigo);
    if (!fila) return { error: 'Llega una foto de ' + codigo + ', que no está en la lista que se guarda.' };

    const ruta = hoja.rutaEsperada(
      { code: fila.codigo, name: fila.nombre, category: fila.categoria },
      extension
    );
    fila.foto = ruta;
    archivos.push({ ruta, datos: Buffer.from(base64, 'base64') });
  }

  return { archivos };
}

function escribeFotos(archivos) {
  for (const { ruta, datos } of archivos) {
    const destino = path.join(RAIZ, ruta);
    // Nunca escribir fuera de sources/productos, pase lo que pase por la URL.
    const permitido = path.join(RAIZ, 'sources', 'productos');
    if (!path.resolve(destino).startsWith(path.resolve(permitido) + path.sep)) {
      throw new Error('Ruta de foto no válida: ' + ruta);
    }
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, datos);
  }
}

// ── Archivos estáticos ──────────────────────────────────────────────────────

function sirveArchivo(res, absoluto, base) {
  const resuelto = path.resolve(absoluto);
  if (!resuelto.startsWith(path.resolve(base) + path.sep) && resuelto !== path.resolve(base)) {
    res.writeHead(403).end('Prohibido');
    return;
  }
  fs.readFile(resuelto, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(resuelto).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(datos);
  });
}

// ── Rutas ───────────────────────────────────────────────────────────────────

async function maneja(req, res) {
  const url = new URL(req.url, 'http://localhost:' + PUERTO);
  const ruta = decodeURIComponent(url.pathname);

  if (req.method === 'GET' && PAGINAS.has(ruta)) {
    sirveArchivo(res, path.join(RAIZ, ruta === '/' ? 'admin.html' : ruta), RAIZ);
    return;
  }

  if (req.method === 'GET' && ruta === '/api/estado') {
    json(res, 200, estadoActual());
    return;
  }

  // Ensayo: devuelve el informe sin escribir nada, ni siquiera el CSV. Es lo que
  // se enseña antes de confirmar.
  if (req.method === 'POST' && ruta === '/api/ensayo') {
    const cuerpo = await leeCuerpo(req);
    const informe = catalogo.calcula(aFilas(cuerpo.productos || []));
    json(res, 200, { ok: informe.errores.length === 0, informe: informeParaPantalla(informe) });
    return;
  }

  // Guardar: fotos, hoja, lista de vetados y catálogo, en ese orden.
  if (req.method === 'POST' && ruta === '/api/guardar') {
    const cuerpo = await leeCuerpo(req);
    const filas = aFilas(cuerpo.productos || []);

    const colocadas = colocaFotos(filas, cuerpo.fotos);
    if (colocadas.error) { json(res, 400, { ok: false, error: colocadas.error }); return; }

    // Las fotos van primero: el validador comprueba que el archivo existe, y
    // así una foto recién elegida no se descarta por no estar todavía en disco.
    escribeFotos(colocadas.archivos);

    const informe = catalogo.calcula(filas);
    if (informe.errores.length) {
      json(res, 400, { ok: false, informe: informeParaPantalla(informe) });
      return;
    }

    catalogo.escribeVetados(cuerpo.vetados || []);
    catalogo.escribeHoja(filas);
    catalogo.escribeCatalogo(informe.resultado);
    catalogo.actualizaNombresEsperados(informe.resultado);
    fotos.regeneraListas(true);   // refresca FOTOS_PENDIENTES.md

    json(res, 200, { ok: true, informe: informeParaPantalla(informe), estado: estadoActual() });
    return;
  }

  // Las fotos de producto, para poder verlas en la tabla.
  if (req.method === 'GET' && ruta.startsWith('/sources/productos/')) {
    sirveArchivo(res, path.join(RAIZ, ruta), path.join(RAIZ, 'sources/productos'));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
}

const servidor = http.createServer((req, res) => {
  maneja(req, res).catch((err) => {
    // El panel enseña este texto tal cual, así que tiene que explicar algo.
    json(res, 500, { ok: false, error: err.message || 'Error inesperado.' });
  });
});

// 127.0.0.1 y no 0.0.0.0: esto escribe en el catálogo y no tiene contraseña.
servidor.listen(PUERTO, '127.0.0.1', () => {
  const direccion = 'http://localhost:' + PUERTO;
  console.log('');
  console.log('  Panel de catálogo NUTRETIUM (local)');
  console.log('  ' + direccion);
  console.log('');
  console.log('  Guardar escribe en products-data.js y en sources/_catalogo/CATALOGO.csv.');
  console.log('  Para que los cambios se vean en nutretium.com hay que subirlos con git.');
  console.log('  Ctrl+C para cerrar.');
  console.log('');
  abreNavegador(direccion);
});

// Abrirlo solo evita tener que explicar qué es una URL. Si falla, no pasa nada:
// la dirección está impresa justo arriba.
function abreNavegador(direccion) {
  const ordenes = {
    win32: ['cmd', ['/c', 'start', '', direccion]],
    darwin: ['open', [direccion]],
  };
  const [orden, argumentos] = ordenes[process.platform] || ['xdg-open', [direccion]];
  try {
    spawn(orden, argumentos, { detached: true, stdio: 'ignore' }).unref();
  } catch { /* que lo abra el usuario */ }
}
