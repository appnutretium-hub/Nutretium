// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — incorpora fotos nuevas al catálogo
//
// Sueltas las fotos en sources/_nuevas/ y esto hace el resto:
//   1. averigua a qué producto pertenece cada archivo (por el código del nombre,
//      o por parecido con el nombre del producto si no lleva código);
//   2. la recorta, la centra en un lienzo de 800 × 800 y la guarda en .webp
//      bajo 150 KB — el mismo tratamiento que las 30 fotos AMRO;
//   3. la deja en sources/productos/<CATEGORIA>/<CODIGO>__<NOMBRE>.webp;
//   4. escribe la ruta en el campo 'image' del producto en products-data.js;
//   5. actualiza NOMBRES_ESPERADOS.csv y FOTOS_PENDIENTES.md.
//
// Por defecto NO toca nada: enseña lo que haría y te deja revisarlo. Solo
// escribe si añades --aplicar. Eso es a propósito: una foto en la ficha
// equivocada es peor que no tener foto.
//
//   node scripts/fotos-incorporar.js              → ensayo, no escribe nada
//   node scripts/fotos-incorporar.js --aplicar    → hace los cambios
//   node scripts/fotos-incorporar.js --aplicar --sin-recorte
//                                                 → no recorta el borde
//                                                   (para fotos ya encuadradas)
//
// Cómo nombrar los archivos: ver sources/_nuevas/LEEME.md
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const BUZON = path.join(RAIZ, 'sources/_nuevas');
const CATALOGO = path.join(RAIZ, 'products-data.js');
const CSV_NOMBRES = path.join(RAIZ, 'sources/productos/NOMBRES_ESPERADOS.csv');
const PENDIENTES = path.join(RAIZ, 'sources/productos/FOTOS_PENDIENTES.md');

const LIENZO = 800;   // lado del cuadrado final
const AIRE = 44;      // margen alrededor del producto
const MAX_KB = 150;

const APLICAR = process.argv.includes('--aplicar');
const SIN_RECORTE = process.argv.includes('--sin-recorte');

const EXTENSIONES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
// El iPhone guarda en .heic si no está en «Más compatible»: sharp no lo abre.
const NO_SOPORTADAS = new Set(['.heic', '.heif']);

// El rango U+0300-U+036F son las marcas de acento que suelta normalize('NFD').
const DIACRITICOS = new RegExp(String.fromCharCode(91, 0x300, 45, 0x36f, 93), 'g');
const normaliza = (s) =>
  (s || '').normalize('NFD').replace(DIACRITICOS, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── Catálogo ────────────────────────────────────────────────────────────────

function leeProductos() {
  delete require.cache[require.resolve(CATALOGO)];
  return require(CATALOGO).NUTRETIUM_PRODUCTS;
}

// Ruta y nombre de archivo que le toca a cada producto. Los fija
// NOMBRES_ESPERADOS.csv, que es la lista maestra de dónde va cada foto.
function rutasEsperadas() {
  const mapa = new Map();
  fs.readFileSync(CSV_NOMBRES, 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
    .forEach((linea) => {
      const [categoria, codigo, ruta, tieneFoto] = linea.split(';');
      mapa.set(codigo, { categoria, ruta, tieneFoto });
    });
  return mapa;
}

// ── Emparejar archivo ↔ producto ────────────────────────────────────────────

// Un archivo puede traer varios códigos separados por '+' cuando varias
// referencias comparten foto (los packs de agua, los dos formatos de un helado).
// Ejemplo: 00500+00532+00539__AGUA_AQUADEUS.jpg
function codigosDelNombre(nombreBase, porCodigo) {
  const cabecera = nombreBase.split('__')[0];
  const trozos = cabecera.split('+').map((c) => c.trim().toUpperCase());
  const encontrados = trozos.filter((c) => porCodigo.has(c));
  return encontrados.length === trozos.length && encontrados.length ? encontrados : null;
}

// Si el archivo no lleva código, se busca el producto por parecido de nombre.
// Devuelve también cuánto se parece, para poder desconfiar de los flojos.
function porParecido(nombreBase, productos) {
  const texto = normaliza(nombreBase.replace(/\.[^.]+$/, ''));
  const palabras = texto.split(' ').filter((p) => p.length > 2);
  if (!palabras.length) return null;

  const puntuados = productos.map((producto) => {
    const objetivo = normaliza(`${producto.name} ${producto.brand || ''}`);
    const aciertos = palabras.filter((p) => objetivo.includes(p)).length;
    return { producto, parecido: aciertos / palabras.length };
  }).sort((a, b) => b.parecido - a.parecido);

  const [mejor, segundo] = puntuados;
  if (!mejor || mejor.parecido < 0.6) return null;
  // Si el segundo empata, no está claro a cuál es: mejor no adivinar.
  if (segundo && segundo.parecido === mejor.parecido) return null;
  return mejor;
}

// ── Tratamiento de la imagen ────────────────────────────────────────────────

async function procesa(origen, destino) {
  const entrada = sharp(origen).rotate();   // rotate() respeta el EXIF del móvil

  let cuerpo = await entrada.clone().flatten({ background: '#ffffff' }).toBuffer();
  if (!SIN_RECORTE) {
    // trim() falla si la foto no tiene borde uniforme: en ese caso se deja tal cual.
    cuerpo = await sharp(cuerpo).trim({ threshold: 12 }).toBuffer().catch(() => cuerpo);
  }

  const base = sharp(cuerpo)
    .resize(LIENZO - AIRE * 2, LIENZO - AIRE * 2, {
      fit: 'contain',
      background: '#ffffff',
    })
    .extend({ top: AIRE, bottom: AIRE, left: AIRE, right: AIRE, background: '#ffffff' })
    .flatten({ background: '#ffffff' });

  let calidad = 86;
  let salida = await base.clone().webp({ quality: calidad }).toBuffer();
  while (salida.length > MAX_KB * 1024 && calidad > 50) {
    calidad -= 8;
    salida = await base.clone().webp({ quality: calidad }).toBuffer();
  }

  if (APLICAR) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, salida);
  }
  return { bytes: salida.length, calidad };
}

// ── Escribir el enlace en products-data.js ──────────────────────────────────

// products-data.js se genera desde el listado del ERP y tiene un producto por
// línea. Enlazar una foto es cambiar "image":null por la ruta EN LA LÍNEA de ese
// código, nada más: así el archivo se puede seguir regenerando y el cambio se
// revisa de un vistazo en el diff.
function enlaza(codigo, ruta) {
  const lineas = fs.readFileSync(CATALOGO, 'utf8').split('\n');
  const aguja = `"code":"${codigo}"`;
  let tocadas = 0;

  const nuevas = lineas.map((linea) => {
    if (!linea.includes(aguja)) return linea;
    const cambiada = linea.replace(/"image":(null|"[^"]*")/, `"image":"${ruta}"`);
    if (cambiada !== linea) tocadas++;
    return cambiada;
  });

  if (tocadas !== 1) {
    throw new Error(`esperaba 1 línea con code ${codigo} y encontré ${tocadas}`);
  }
  if (APLICAR) fs.writeFileSync(CATALOGO, nuevas.join('\n'), 'utf8');
}

// ── Listas de control ───────────────────────────────────────────────────────

// Cada producto sin foto se resuelve por una vía o por otra, y no son
// intercambiables: al de marca le pides el packshot a quien te lo vende, y al
// propio de la tienda no le queda más remedio que fotografiarlo aquí.
const PREFIJOS_PROPIOS = /^(ICE-|CAFE-|BATI-|CAPRI-|DAILY-|BOWL-|ABB-|BG-|BCB-|CP-|DP-|MS-|RX-)/;
const CATEGORIAS_PROPIAS = new Set([
  'Bowls', 'Yogures', 'Smoothies y batidos', 'Waffles y caprichos', 'Café y matcha',
]);
const NOMBRES_PROPIOS = /^(agua pequena|zumo naranja|bolw|cafe \+ leche|dip extra|capricho|berry smoothie|batido (mango|chocolate))/;

// Marcas que el ERP no rellena en el campo 'brand' pero sí van en el nombre.
// Primer elemento = como se llama el proveedor; el resto, cómo aparece escrito
// en el listado ('Aqua Deus' separado, 'Simon' por Don Simón…).
const MARCAS_EN_EL_NOMBRE = [
  ['Barebells'], ['Protella'], ['Servivita'], ['Protzen'], ['Nocco'],
  ['Vitamin Well'], ['NABE'], ['Cacaolat'], ['Amro'], ['Red Bull'],
  ['Aquadeus', 'Aqua Deus'],
  ['Solares'],
  ['Don Simon', 'Zumo Simon'],
  ['Pascual', 'Bio Futras', 'Bifrutas'],
];

function esPropio(p) {
  if (PREFIJOS_PROPIOS.test(p.code)) return true;
  if (CATEGORIAS_PROPIAS.has(p.category)) return true;
  return NOMBRES_PROPIOS.test(normaliza(p.name));
}

// A quién hay que pedirle la foto. Sirve para agrupar la lista de pendientes
// por proveedor, que es como se manda el correo.
function proveedorDe(p) {
  if (p.brand) return p.brand;
  const nombre = normaliza(p.name);
  const encontrada = MARCAS_EN_EL_NOMBRE
    .find((variantes) => variantes.some((v) => nombre.includes(normaliza(v))));
  return encontrada ? encontrada[0] : "Sin marca identificada";
}

function tablaDe(lista) {
  const filas = ['| Código | Producto | Categoría |', '|---|---|---|'];
  lista.forEach((p) => filas.push(`| \`${p.code}\` | ${p.name} | ${p.category} |`));
  return filas;
}

function regeneraListas() {
  const productos = leeProductos();
  const rutas = rutasEsperadas();

  // NOMBRES_ESPERADOS.csv: la lista maestra de dónde va la foto de cada producto.
  const csv = ['categoria;codigo;ruta_esperada;tiene_foto'];
  productos.forEach((p) => {
    const esperada = rutas.get(p.code);
    if (!esperada) return;
    csv.push([p.category, p.code, esperada.ruta, p.image ? 'si' : 'no'].join(';'));
  });
  if (APLICAR) fs.writeFileSync(CSV_NOMBRES, csv.join('\n') + '\n', 'utf8');

  const sinFoto = productos.filter((p) => !p.image);
  const propios = sinFoto.filter(esPropio);
  const deMarca = sinFoto.filter((p) => !esPropio(p));

  const porProveedor = new Map();
  deMarca.forEach((p) => {
    const proveedor = proveedorDe(p);
    if (!porProveedor.has(proveedor)) porProveedor.set(proveedor, []);
    porProveedor.get(proveedor).push(p);
  });

  const md = [
    '# Fotos que faltan',
    '',
    '> Generado por `scripts/fotos-incorporar.js`. No editar a mano: se rehace',
    '> solo cada vez que se incorporan fotos nuevas.',
    '',
    `**${sinFoto.length} de ${productos.length} productos siguen sin foto** ` +
    `(${productos.length - sinFoto.length} ya la tienen).`,
    '',
    'Se parten en dos grupos que se resuelven de forma distinta. Para meter las',
    'fotos una vez conseguidas, ver `sources/_nuevas/LEEME.md`.',
    '',
    '---',
    '',
    `## A. Pedir el packshot al distribuidor — ${deMarca.length} productos`,
    '',
    'Producto de marca envasado: el fabricante tiene foto oficial y material de',
    'punto de venta, y con él viene el permiso de uso. Es de donde salieron las',
    '30 fotos AMRO que ya están publicadas. Cada apartado de abajo es la lista',
    'que hay que pedirle a ese proveedor.',
    '',
  ];
  [...porProveedor.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .forEach(([proveedor, lista]) => {
      md.push(`### ${proveedor} — ${lista.length}`, '', ...tablaDe(lista), '');
    });

  md.push(
    '---',
    '',
    `## B. Fotografiar en la tienda — ${propios.length} productos`,
    '',
    'Recetas y elaboraciones de la casa: **no existen en internet**. Nadie tiene',
    'una foto de un «Royal X 750 ml» salvo Nutretium. Con el móvil, fondo liso y',
    'luz de ventana es suficiente; los consejos están en `sources/_nuevas/LEEME.md`.',
    '',
    'Un mismo plato en varios tamaños puede compartir foto: se nombra el archivo',
    'con los códigos separados por `+`.',
    '',
    ...tablaDe(propios),
    '',
  );

  if (APLICAR) fs.writeFileSync(PENDIENTES, md.join('\n'), 'utf8');
  return sinFoto.length;
}


// ── Principal ───────────────────────────────────────────────────────────────

async function principal() {
  if (!fs.existsSync(BUZON)) {
    console.log(`No existe ${path.relative(RAIZ, BUZON)}. Créala y suelta ahí las fotos.`);
    return;
  }

  const productos = leeProductos();
  const porCodigo = new Map(productos.map((p) => [p.code.toUpperCase(), p]));
  const rutas = rutasEsperadas();

  const archivos = fs.readdirSync(BUZON)
    .filter((n) => !n.startsWith('.') && n.toLowerCase() !== 'leeme.md')
    .filter((n) => fs.statSync(path.join(BUZON, n)).isFile());

  // Con el buzón vacío no hay nada que incorporar, pero sí conviene refrescar
  // las listas de control: así se puede pedir el listado de pendientes al día
  // sin tener que meter una foto primero.
  if (!archivos.length) {
    const faltan = regeneraListas();
    console.log(`${path.relative(RAIZ, BUZON)} está vacía: no hay fotos que incorporar.`);
    console.log(`Faltan ${faltan} de ${productos.length} fotos.`);
    if (APLICAR) console.log('Listas actualizadas: sources/productos/FOTOS_PENDIENTES.md');
    return;
  }

  const seguros = [];
  const dudosos = [];
  const rechazados = [];

  for (const archivo of archivos) {
    const extension = path.extname(archivo).toLowerCase();
    if (NO_SOPORTADAS.has(extension)) {
      rechazados.push([archivo, 'formato HEIC del iPhone: exportar como JPG ' +
        '(Ajustes › Cámara › Formatos › Más compatible)']);
      continue;
    }
    if (!EXTENSIONES.has(extension)) {
      rechazados.push([archivo, `extensión ${extension || '(ninguna)'} no soportada`]);
      continue;
    }

    const base = path.basename(archivo, extension);
    const codigos = codigosDelNombre(base, porCodigo);
    if (codigos) {
      codigos.forEach((codigo) => seguros.push({ archivo, codigo, motivo: 'código en el nombre' }));
      continue;
    }

    const aproximado = porParecido(base, productos);
    if (aproximado) {
      dudosos.push({
        archivo,
        codigo: aproximado.producto.code,
        motivo: `parecido ${Math.round(aproximado.parecido * 100)} % con «${aproximado.producto.name}»`,
      });
      continue;
    }
    rechazados.push([archivo, 'no se sabe de qué producto es: renombrar con el código delante']);
  }

  const aTratar = [...seguros, ...dudosos];

  console.log(APLICAR ? '── Incorporando fotos ──\n' : '── ENSAYO: no se escribe nada (añade --aplicar) ──\n');

  for (const item of aTratar) {
    const esperada = rutas.get(item.codigo);
    const producto = porCodigo.get(item.codigo.toUpperCase());
    if (!esperada) {
      rechazados.push([item.archivo, `el código ${item.codigo} no está en NOMBRES_ESPERADOS.csv`]);
      continue;
    }
    const destino = path.join(RAIZ, esperada.ruta);
    const yaTenia = producto.image ? '  (SUSTITUYE la que ya tenía)' : '';
    try {
      const { bytes } = await procesa(path.join(BUZON, item.archivo), destino);
      enlaza(item.codigo, esperada.ruta);
      const marca = dudosos.includes(item) ? '?' : '✓';
      console.log(`${marca} ${item.codigo}  ${producto.name}${yaTenia}`);
      console.log(`   ${item.archivo} → ${esperada.ruta}  (${(bytes / 1024).toFixed(0)} KB, ${item.motivo})`);
    } catch (err) {
      rechazados.push([item.archivo, err.message]);
    }
  }

  if (dudosos.length) {
    console.log(`\n⚠  ${dudosos.length} archivo(s) marcados con '?': el código no venía en el`);
    console.log('   nombre y se ha deducido por parecido. REVISA que la foto sea la correcta');
    console.log('   antes de publicar; si no, renombra el archivo con el código delante.');
  }

  if (rechazados.length) {
    console.log('\n── Sin incorporar ──');
    rechazados.forEach(([archivo, motivo]) => console.log(`✗ ${archivo}\n   ${motivo}`));
  }

  const faltan = regeneraListas();
  const total = productos.length;
  console.log(`\n${total - faltan}/${total} productos con foto — faltan ${faltan}.`);

  if (!APLICAR) {
    console.log('\nNo se ha escrito nada. Si el reparto de arriba es correcto:');
    console.log('  node scripts/fotos-incorporar.js --aplicar');
  } else {
    console.log('\nHecho. Repasa el diff de products-data.js y abre la web para verlas.');
    console.log('Los archivos originales siguen en sources/_nuevas/: bórralos cuando estés conforme.');
  }
}

principal();
