/**
 * netlify/lib/catalogo-hoja.js — NUTRETIUM
 *
 * El validador del catálogo. Decide qué se puede publicar y qué no, y genera el
 * products-data.js resultante.
 *
 * Vive aquí, y no en scripts/, porque lo usan TRES vías de edición:
 *
 *   · Excel            → scripts/catalogo-actualizar.js
 *   · panel local      → scripts/panel-servidor.js
 *   · panel online     → netlify/functions/admin-catalogo.js
 *
 * Y tienen que decidir exactamente lo mismo. Un validador por vía es la misma
 * trampa que documenta CLAUDE.md con las dos listas de productos: en cuanto se
 * separan, una publica algo que la otra habría rechazado.
 *
 * No toca el disco ni conoce el proyecto: quien llama le pasa el catálogo
 * actual, las categorías, la lista de vetados y cómo comprobar si una foto
 * existe. Así el mismo código vale en tu ordenador y dentro de una función de
 * Netlify, donde no hay sistema de archivos que valga.
 */

'use strict';

/** Columnas de la hoja, en orden. Es también el orden del CSV. */
const COLUMNAS = [
  'codigo', 'nombre', 'categoria', 'precio', 'stock',
  'activo', 'destacado', 'etiqueta', 'marca', 'foto',
];

/**
 * Un precio por encima de esto casi seguro es un error de tecleo (un cero de
 * más, una coma que se fue de sitio). Se avisa y no se aplica.
 */
const PRECIO_MAXIMO = 500;

/** Lo que se escribe en la columna 'stock' para decir «este no se controla». */
const SIN_CONTROL = new Set(['siempre', 'always', 'sin control', 'ilimitado', '-', 'null', '']);

const SI = new Set(['si', 'yes', 's', 'x', '1', 'true', 'verdadero']);
const NO = new Set(['no', 'n', '0', 'false', 'falso']);

/** Largo máximo de un nombre. Más que eso rompe la maquetación de la ficha. */
const MAX_NOMBRE = 120;

// El rango U+0300-U+036F son las marcas de acento que suelta normalize('NFD').
const DIACRITICOS = new RegExp(String.fromCharCode(91, 0x300, 45, 0x36f, 93), 'g');
const sinAcentos = (s) => (s || '').normalize('NFD').replace(DIACRITICOS, '');

// ── Conversiones de las celdas ──────────────────────────────────────────────

const comoTextoStock = (stock) => (stock === null || stock === undefined ? 'siempre' : String(stock));

/**
 * Excel escribe el precio con coma decimal, y quien copia de otro sitio lo trae
 * con punto (y a veces con el símbolo del euro pegado). Se aceptan los tres.
 */
function leePrecio(texto) {
  const limpio = String(texto === 0 ? '0' : (texto || '')).replace(/[€\s]/g, '').replace(',', '.');
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const escribePrecio = (precio) => String(Number(precio).toFixed(2)).replace('.', ',');

/** La celda vacía no es un 'no': es «no lo he tocado», y vale lo de siempre. */
function leeSiNo(texto, porDefecto) {
  const v = sinAcentos(String(texto === false ? 'no' : (texto || ''))).trim().toLowerCase();
  if (v === '') return porDefecto;
  if (SI.has(v)) return true;
  if (NO.has(v)) return false;
  return porDefecto;
}

const escribeSiNo = (valor) => (valor ? 'SI' : 'NO');

// ── Dónde va la foto de cada producto ───────────────────────────────────────

const enMayusculas = (s) =>
  sinAcentos(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Ruta canónica de la foto de un producto. La misma fórmula que usa
 * NOMBRES_ESPERADOS.csv, para que una foto puesta desde el panel online caiga
 * donde la buscaría scripts/fotos-incorporar.js.
 */
function rutaEsperada({ code, name, category }, extension = 'webp') {
  return `sources/productos/${enMayusculas(category)}/${code}__${enMayusculas(name)}.${extension}`;
}

// ── Catálogo ────────────────────────────────────────────────────────────────

/**
 * Cada categoría usa siempre el mismo emoji (es el dibujo que sale cuando no
 * hay foto). Se deduce del propio catálogo en vez de repetir aquí la tabla: así
 * no hay dos listas que puedan discrepar.
 */
function emojisPorCategoria(productos) {
  const mapa = new Map();
  for (const p of productos) {
    if (p.emoji && !mapa.has(p.category)) mapa.set(p.category, p.emoji);
  }
  return mapa;
}

/** Producto del catálogo → fila de la hoja. Es la inversa de calcula(). */
function filaDeProducto(p) {
  return {
    codigo: p.code,
    nombre: p.name,
    categoria: p.category,
    precio: escribePrecio(Number(p.price)),
    stock: comoTextoStock(p.stock),
    activo: escribeSiNo(p.active !== false),
    destacado: escribeSiNo(p.featured === true),
    etiqueta: p.badge || '',
    marca: p.brand || '',
    foto: p.image || '',
  };
}

// ── El validador ────────────────────────────────────────────────────────────

/**
 * Compara una hoja con el catálogo actual y devuelve el catálogo que
 * resultaría. No escribe nada: quien llama decide si aplicarlo.
 *
 * @param {object}   opciones
 * @param {object[]} opciones.filas       filas de la hoja (claves de COLUMNAS)
 * @param {object[]} opciones.productos   catálogo actual (NUTRETIUM_PRODUCTS)
 * @param {string[]} opciones.categorias  categorías válidas
 * @param {Array}    [opciones.vetados]   [{codigo, motivo}] que no se publican nunca
 * @param {Function} [opciones.existeFoto] (ruta) => boolean; si falta, no se comprueba
 */
function calcula({ filas, productos, categorias, vetados = [], existeFoto = null }) {
  const emojis = emojisPorCategoria(productos);
  const porCodigo = new Map(productos.map((p) => [String(p.code).toUpperCase(), p]));
  const categoriasValidas = new Set(categorias);
  const veto = new Map(vetados.map((v) => [String(v.codigo).trim().toUpperCase(), v.motivo || '']));

  const errores = [];
  const avisos = [];
  const altas = [];
  const bajas = [];
  const cambios = [];
  const excluidos = [];

  const vistos = new Set();
  const resultado = [];
  let siguienteId = productos.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0);

  for (const fila of filas) {
    const donde = `fila ${fila.__linea ?? '?'}`;
    const codigo = String(fila.codigo || '').trim().toUpperCase();
    const nombre = String(fila.nombre || '').trim();

    if (!codigo) { errores.push(`${donde}: falta el código, que es lo que identifica al producto.`); continue; }
    if (vistos.has(codigo)) { errores.push(`${donde}: el código ${codigo} está repetido en la hoja.`); continue; }
    vistos.add(codigo);

    if (veto.has(codigo)) {
      excluidos.push({ codigo, nombre, motivo: veto.get(codigo) || 'sin motivo anotado' });
      continue;
    }

    if (!nombre) { errores.push(`${donde} (${codigo}): falta el nombre.`); continue; }
    if (nombre.length > MAX_NOMBRE) {
      errores.push(`${donde} (${codigo}): el nombre pasa de ${MAX_NOMBRE} caracteres y no cabe en la ficha.`);
      continue;
    }
    // El nombre se pinta con innerHTML en app.js y viaja al correo del pedido.
    // Con el panel online el catálogo se edita desde internet: si alguien se
    // hiciera con la cuenta de administrador, un nombre con etiquetas sería
    // JavaScript ejecutándose en la página del carrito.
    if (/[<>]/.test(nombre) || /[<>]/.test(String(fila.etiqueta || '')) || /[<>]/.test(String(fila.marca || ''))) {
      errores.push(`${donde} (${codigo}): el nombre, la marca y la etiqueta no pueden llevar «<» ni «>».`);
      continue;
    }

    if (!categoriasValidas.has(fila.categoria)) {
      errores.push(
        `${donde} (${codigo}): la categoría «${fila.categoria}» no existe.\n` +
        `    Las válidas son: ${categorias.join(', ')}`
      );
      continue;
    }

    const precio = leePrecio(fila.precio);
    if (precio === null || precio <= 0) {
      errores.push(`${donde} (${codigo}): precio «${fila.precio}» no válido. Un producto sin precio no se puede cobrar.`);
      continue;
    }
    if (precio > PRECIO_MAXIMO) {
      errores.push(`${donde} (${codigo}): ${escribePrecio(precio)} € pasa de ${PRECIO_MAXIMO} €. Si es correcto, sube PRECIO_MAXIMO en netlify/lib/catalogo-hoja.js.`);
      continue;
    }

    let stock;
    const stockTexto = sinAcentos(String(fila.stock ?? '')).trim().toLowerCase();
    if (SIN_CONTROL.has(stockTexto)) {
      stock = null;
    } else {
      const n = Number(stockTexto);
      if (!Number.isInteger(n) || n < 0) {
        errores.push(`${donde} (${codigo}): stock «${fila.stock}» no válido. Pon un número entero, o «siempre» si no se controla.`);
        continue;
      }
      stock = n;
    }

    let foto = String(fila.foto || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (foto && !foto.startsWith('sources/productos/')) {
      avisos.push(`${donde} (${codigo}): la foto «${foto}» está fuera de sources/productos/. Se deja sin foto.`);
      foto = '';
    }
    if (foto && existeFoto && !existeFoto(foto)) {
      avisos.push(`${donde} (${codigo}): la foto «${foto}» no existe en el proyecto. Se deja sin foto.`);
      foto = '';
    }

    const anterior = porCodigo.get(codigo);
    const producto = {
      id: anterior ? anterior.id : ++siguienteId,
      code: anterior ? anterior.code : String(fila.codigo).trim(),
      name: nombre,
      category: fila.categoria,
      price: precio,
      stock,
      badge: String(fila.etiqueta || '').trim() || null,
      badgeColor: anterior ? anterior.badgeColor : '',
      featured: leeSiNo(fila.destacado, false),
      image: foto || null,
      emoji: anterior ? anterior.emoji : (emojis.get(fila.categoria) || '🛒'),
      customizable: anterior ? anterior.customizable : false,
      brand: String(fila.marca || '').trim() || null,
      description: anterior ? anterior.description : null,
      rating: anterior ? anterior.rating : 0,
      reviews: anterior ? anterior.reviews : 0,
      active: leeSiNo(fila.activo, true),
      sourceFamily: anterior ? anterior.sourceFamily : 'Alta manual (hoja/panel)',
      pdfDescription: anterior ? anterior.pdfDescription : null,
    };

    if (!anterior) {
      altas.push(producto);
    } else {
      const diferencias = [];
      const compara = (etiqueta, antes, ahora) => {
        if (JSON.stringify(antes) !== JSON.stringify(ahora)) {
          diferencias.push(`${etiqueta}: ${antes === null ? 'sin definir' : antes} → ${ahora === null ? 'sin definir' : ahora}`);
        }
      };
      compara('nombre', anterior.name, producto.name);
      compara('categoría', anterior.category, producto.category);
      compara('precio', `${escribePrecio(Number(anterior.price))} €`, `${escribePrecio(producto.price)} €`);
      compara('stock', comoTextoStock(anterior.stock), comoTextoStock(producto.stock));
      compara('publicado', escribeSiNo(anterior.active !== false), escribeSiNo(producto.active));
      compara('destacado', escribeSiNo(anterior.featured === true), escribeSiNo(producto.featured));
      compara('etiqueta', anterior.badge, producto.badge);
      compara('marca', anterior.brand, producto.brand);
      compara('foto', anterior.image, producto.image);
      if (diferencias.length) cambios.push({ producto, diferencias });
    }

    resultado.push(producto);
  }

  // Baja es todo lo que estaba en el catálogo y no queda en el resultado: tanto
  // lo que se borró de la hoja como lo que veta la lista de no vendibles.
  const quedan = new Set(resultado.map((p) => String(p.code).toUpperCase()));
  for (const p of productos) {
    if (!quedan.has(String(p.code).toUpperCase())) bajas.push(p);
  }

  // El id es la clave con la que el navegador pide el producto y con la que el
  // servidor lo cobra. Se ordena por id para que el archivo no se reordene
  // entero cuando alguien ordena el Excel por precio: así el diff se lee.
  resultado.sort((a, b) => a.id - b.id);

  return { resultado, errores, avisos, altas, bajas, cambios, excluidos, anteriores: productos };
}

// ── Leer products-data.js como texto ────────────────────────────────────────

/**
 * Saca las dos listas de un products-data.js sin ejecutarlo.
 *
 * El panel online trae el archivo de GitHub para editar SIEMPRE la última
 * versión (la que va en el paquete de la función es la del despliegue actual, y
 * puede estar atrasada). Ejecutar código descargado dentro de la función sería
 * la vía fácil y la mala: el archivo tiene un producto por línea en JSON, así
 * que se parsea y ya está.
 */
function parsea(texto) {
  const lista = (marca) => {
    const inicio = texto.indexOf(marca);
    if (inicio === -1) throw new Error(`products-data.js no tiene ${marca.trim()}`);
    const corchete = texto.indexOf('[', inicio);
    const fin = texto.indexOf('\n];', corchete);
    if (fin === -1) throw new Error(`No encuentro el cierre de ${marca.trim()}`);
    return JSON.parse(texto.slice(corchete, fin + 2));
  };
  return {
    categorias: lista('NUTRETIUM_CATEGORIES = '),
    productos: lista('NUTRETIUM_PRODUCTS = '),
  };
}

// ── Generar products-data.js ────────────────────────────────────────────────

const MARCA_INICIO = 'NUTRETIUM_RAIZ.NUTRETIUM_PRODUCTS = [';
const MARCA_FIN = '\n];';

/**
 * Orden de los campos dentro de cada línea. Fijo a propósito: si cambia, el
 * diff de products-data.js pasa de cuatro líneas a las 151.
 */
const CAMPOS = [
  'id', 'code', 'name', 'category', 'price', 'stock', 'badge', 'badgeColor',
  'featured', 'image', 'emoji', 'customizable', 'brand', 'description',
  'rating', 'reviews', 'active', 'sourceFamily', 'pdfDescription',
];

/**
 * Devuelve el texto completo de products-data.js con el catálogo nuevo,
 * conservando la cabecera y el cierre del archivo original.
 *
 * Devuelve texto en vez de escribirlo porque el panel online no escribe en
 * disco: lo manda a GitHub como contenido de un commit.
 */
function renderiza(productos, textoOriginal) {
  const inicio = textoOriginal.indexOf(MARCA_INICIO);
  const fin = textoOriginal.indexOf(MARCA_FIN, inicio);
  if (inicio === -1 || fin === -1) {
    throw new Error('No encuentro la lista de productos dentro de products-data.js.');
  }

  const lineas = productos.map((p) => {
    const ordenado = {};
    CAMPOS.forEach((c) => { ordenado[c] = p[c] === undefined ? null : p[c]; });
    return ' ' + JSON.stringify(ordenado);
  });

  const cabecera = actualizaResumen(textoOriginal.slice(0, inicio), productos);
  return cabecera + MARCA_INICIO + '\n' + lineas.join(',\n') + textoOriginal.slice(fin);
}

/**
 * La cabecera del archivo lleva el recuento de productos. Si no se refresca, al
 * mes siguiente dice una cifra y el archivo tiene otra.
 */
function actualizaResumen(cabecera, productos) {
  const publicados = productos.filter((p) => p.active !== false);
  const conStock = publicados.filter((p) => p.stock === null || p.stock > 0);
  const hoy = new Date().toLocaleDateString('es-ES');
  const linea =
    `// Actualizado el ${hoy}: ${productos.length} productos, ${publicados.length} publicados ` +
    `(${conStock.length} disponibles, ${publicados.length - conStock.length} agotados).`;

  if (/^\/\/ Actualizado el .*$/m.test(cabecera)) {
    return cabecera.replace(/^\/\/ Actualizado el .*$/m, linea);
  }
  return cabecera + linea + '\n';
}

module.exports = {
  COLUMNAS, CAMPOS, PRECIO_MAXIMO, SIN_CONTROL, MAX_NOMBRE,
  sinAcentos, enMayusculas, rutaEsperada,
  leePrecio, escribePrecio, leeSiNo, escribeSiNo, comoTextoStock,
  emojisPorCategoria, filaDeProducto,
  calcula, renderiza, parsea,
};
