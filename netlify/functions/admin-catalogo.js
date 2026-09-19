/**
 * netlify/functions/admin-catalogo.js — NUTRETIUM
 *
 * El panel de catálogo online (/admin.html), por dentro.
 *
 * Solo entra quien esté en ADMIN_EMAILS y traiga una sesión válida: lo
 * comprueba netlify/lib/admin.js en TODAS las acciones, incluso en las de solo
 * lectura. La página no protege nada — es un archivo estático que cualquiera
 * puede descargar; lo que protege es esto.
 *
 * Publicar es un commit al repositorio (netlify/lib/github.js) y Netlify
 * despliega solo. No se escribe en ningún almacén: products-data.js sigue
 * siendo la única lista de productos, que es la regla que sostiene todo lo
 * demás (ver CLAUDE.md).
 *
 * El validador es el MISMO que usan Excel y el panel local
 * (netlify/lib/catalogo-hoja.js): las tres vías aceptan y rechazan lo mismo.
 *
 * Acciones (POST, JSON, con Authorization: Bearer <token>):
 *   estado    → catálogo actual, categorías y lista de vetados
 *   ensayo    → qué cambiaría, sin publicar
 *   publicar  → valida, hace el commit y devuelve su enlace
 */

'use strict';

const { cabecerasCORS } = require('../lib/cors');
const { exigeAdmin } = require('../lib/admin');
const hoja = require('../lib/catalogo-hoja');
const github = require('../lib/github');
const vetadosDelRepo = require('../lib/no-vendibles');

const CORS = cabecerasCORS('POST, OPTIONS');

const RUTA_CATALOGO = 'products-data.js';
const RUTA_VETADOS = 'netlify/lib/no-vendibles.js';

// Netlify corta las peticiones a 6 MB, y la foto viaja en base64 (+33 %). El
// tope que manda es el de BYTES; el de número solo está para que un envío
// absurdo no se ponga a recorrer una lista sin fin.
//
// Antes el tope eran 12 fotos, y era el que estorbaba: con 95 productos sin
// foto obligaba a publicar ocho veces, y **cada publicación es un despliegue
// entero**. Se agotó así la asignación de Netlify (30 despliegues para 30
// fotos, una a una). El panel aprieta ahora cada foto a 35 KB (MAX_KB en
// admin.js). El límite binario se deja en 3,5 MiB para que, después del +33 %
// de base64 y del JSON/catálogo, la petición conserve margen bajo el corte de
// 6 MB de Netlify. Sigue permitiendo más de cien fotos de 35 KB en una tanda.
const MAX_FOTOS = 150;
const MAX_BYTES_FOTOS = Math.floor(3.5 * 1024 * 1024);
const MAX_PRODUCTOS = 1000;
const EXTENSIONES = new Set(['webp', 'jpg', 'jpeg', 'png']);

const respuesta = (statusCode, cuerpo) => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(cuerpo),
});

// ── Traducción entre lo que manda el navegador y las filas de la hoja ───────

// Aquí no se valida nada: de eso se encarga hoja.calcula(), que es el mismo
// control por el que pasan el Excel y el panel local. Un solo sitio donde se
// decide qué es un precio válido.
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
    __linea: i + 2,
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

function paraElPanel(productos) {
  return productos.map((p) => ({
    codigo: p.code,
    nombre: p.name,
    categoria: p.category,
    precio: Number(p.price),
    stock: p.stock,
    activo: p.active !== false,
    destacado: p.featured === true,
    etiqueta: p.badge || '',
    marca: p.brand || '',
    foto: p.image || '',
    emoji: p.emoji || '',
  }));
}

// ── Fotos que llegan con la publicación ─────────────────────────────────────

/**
 * Las fotos vienen ya tratadas por el navegador (recortadas al lienzo cuadrado
 * y convertidas a webp) y viajan en el mismo envío que el catálogo, para que
 * todo entre en UN commit: si la foto fuera aparte, habría un despliegue
 * intermedio con el catálogo apuntando a un archivo que todavía no existe.
 */
function revisaFotos(fotos) {
  if (!Array.isArray(fotos) || !fotos.length) return { fotos: [] };
  if (fotos.length > MAX_FOTOS) {
    return { error: 'Van ' + fotos.length + ' fotos y el máximo por publicación es ' + MAX_FOTOS +
      '. Quita algunas y publica el resto después.' };
  }

  let bytes = 0;
  const limpias = [];

  for (const foto of fotos) {
    const codigo = String(foto && foto.codigo || '').trim();
    const extension = String(foto && foto.extension || 'webp').toLowerCase().replace(/^\./, '');
    const base64 = String(foto && foto.base64 || '').split(',').pop();

    if (!codigo) return { error: 'Llega una foto sin saber de qué producto es.' };
    if (!EXTENSIONES.has(extension)) return { error: 'Formato de foto no admitido: ' + extension + '.' };
    if (!base64) return { error: 'La foto de ' + codigo + ' llegó vacía.' };

    bytes += Math.ceil(base64.length * 3 / 4);
    if (bytes > MAX_BYTES_FOTOS) {
      return { error: 'Las fotos superan el límite seguro por publicación y no caben en un envío. Han entrado ' + limpias.length + ' de ' + fotos.length +
        ': quita las que sobran, publica, y luego vuelve a por el resto.' };
    }
    limpias.push({ codigo: codigo.toUpperCase(), extension, base64 });
  }

  return { fotos: limpias };
}

/**
 * Coloca cada foto en la ruta que le toca y la escribe en su fila.
 */
function colocaFotos(filas, fotos) {
  const porCodigo = new Map(filas.map((fila) => [String(fila.codigo).toUpperCase(), fila]));
  const archivos = [];

  for (const foto of fotos) {
    const fila = porCodigo.get(foto.codigo);
    if (!fila) {
      return { error: 'Llega una foto del producto ' + foto.codigo + ', que no está en la lista que se publica.' };
    }
    const ruta = hoja.rutaEsperada(
      { code: fila.codigo, name: fila.nombre, category: fila.categoria },
      foto.extension
    );
    fila.foto = ruta;
    archivos.push({ codigo: foto.codigo, ruta, base64: foto.base64 });
  }

  return { archivos };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return respuesta(405, { error: 'Method Not Allowed' });
  }

  const permiso = exigeAdmin(event);
  if (!permiso.ok) return respuesta(permiso.statusCode, { error: permiso.error });

  let cuerpo;
  try { cuerpo = JSON.parse(event.body || '{}'); }
  catch { return respuesta(400, { error: 'El envío no es JSON válido.' }); }

  if (!github.configurado()) {
    console.error('[admin-catalogo] Falta GITHUB_TOKEN. Configúralo en Netlify o el panel no funciona.');
    return respuesta(503, {
      error: 'Falta GITHUB_TOKEN en las variables de entorno de Netlify: el panel no puede ' +
        'leer ni publicar el catálogo. Mientras tanto se puede usar el panel local (npm run panel).',
    });
  }

  try {
    if (cuerpo.action === 'estado') {
      const texto = await github.leeArchivo(RUTA_CATALOGO);
      const { productos, categorias } = hoja.parsea(texto);
      return respuesta(200, {
        modo: 'online',
        administrador: permiso.email,
        repositorio: github.repositorio(),
        rama: github.rama(),
        categorias,
        productos: paraElPanel(productos),
        vetados: vetadosDelRepo.map((v) => ({ codigo: v.codigo, motivo: v.motivo })),
      });
    }

    if (!Array.isArray(cuerpo.productos)) {
      return respuesta(400, { error: 'Falta la lista de productos.' });
    }
    if (cuerpo.productos.length > MAX_PRODUCTOS) {
      return respuesta(400, { error: `El catálogo no puede pasar de ${MAX_PRODUCTOS} productos.` });
    }

    const textoActual = await github.leeArchivo(RUTA_CATALOGO);
    const { productos, categorias } = hoja.parsea(textoActual);
    const filas = aFilas(cuerpo.productos);

    const revision = revisaFotos(cuerpo.fotos);
    if (revision.error) return respuesta(400, { error: revision.error });

    const colocadas = colocaFotos(filas, revision.fotos);
    if (colocadas.error) return respuesta(400, { error: colocadas.error });
    const fotos = colocadas.archivos;

    const disponibles = new Set([
      ...productos.map((p) => p.image).filter(Boolean),
      ...fotos.map((f) => f.ruta),
    ]);

    const vetados = Array.isArray(cuerpo.vetados) && cuerpo.action === 'publicar'
      ? cuerpo.vetados
      : vetadosDelRepo;

    const informe = hoja.calcula({
      filas,
      productos,
      categorias,
      vetados,
      existeFoto: (ruta) => disponibles.has(ruta),
    });

    if (cuerpo.action === 'ensayo') {
      return respuesta(200, { ok: informe.errores.length === 0, informe: informeParaPantalla(informe) });
    }

    if (cuerpo.action === 'publicar') {
      if (informe.errores.length) {
        return respuesta(400, { ok: false, informe: informeParaPantalla(informe) });
      }
      if (!informe.altas.length && !informe.bajas.length && !informe.cambios.length && !fotos.length) {
        return respuesta(200, { ok: true, sinCambios: true, informe: informeParaPantalla(informe) });
      }

      const archivos = [
        { ruta: RUTA_CATALOGO, texto: hoja.renderiza(informe.resultado, textoActual) },
        ...fotos.map((f) => ({ ruta: f.ruta, base64: f.base64 })),
      ];

      if (JSON.stringify(vetados) !== JSON.stringify(vetadosDelRepo.map((v) => ({ codigo: v.codigo, motivo: v.motivo })))) {
        const textoVetados = await github.leeArchivo(RUTA_VETADOS);
        archivos.push({ ruta: RUTA_VETADOS, texto: renderizaVetados(textoVetados, vetados) });
      }

      const resumen = [
        informe.altas.length && `${informe.altas.length} alta(s)`,
        informe.bajas.length && `${informe.bajas.length} baja(s)`,
        informe.cambios.length && `${informe.cambios.length} cambio(s)`,
        fotos.length && `${fotos.length} foto(s)`,
      ].filter(Boolean).join(', ');

      const commit = await github.publica({
        mensaje: `Catálogo desde el panel: ${resumen}\n\nPublicado por ${permiso.email}.`,
        archivos,
      });

      return respuesta(200, {
        ok: true,
        informe: informeParaPantalla(informe),
        commit,
        fotos: fotos.map((f) => ({ codigo: f.codigo, ruta: f.ruta })),
      });
    }

    return respuesta(400, { error: 'Acción no reconocida.' });
  } catch (err) {
    console.error('[admin-catalogo]', err);
    return respuesta(500, { error: err.message || 'Error inesperado.' });
  }
};

function renderizaVetados(original, lista) {
  const inicio = original.indexOf('module.exports = [');
  if (inicio === -1) throw new Error('No encuentro la lista dentro de no-vendibles.js.');
  const lineas = lista.map((v) =>
    `  { codigo: ${JSON.stringify(String(v.codigo).trim())}, motivo: ${JSON.stringify(String(v.motivo || '').trim())} },`
  );
  return original.slice(0, inicio) + 'module.exports = [\n' + lineas.join('\n') + '\n];\n';
}
