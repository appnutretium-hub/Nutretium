// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — actualiza el catálogo desde un CSV
//
// products-data.js se generó desde el listado del ERP y no se edita a mano.
// Esto es la vía de Excel: el CSV es la hoja de trabajo (precios, altas, bajas,
// fotos, qué se publica y qué no) y este script la vuelca al catálogo
// comprobando antes que todo cuadra.
//
//   npm run catalogo -- --exportar   escribe el CSV con el catálogo actual
//   npm run catalogo                 ensayo: enseña qué cambiaría, no toca nada
//   npm run catalogo -- --aplicar    escribe los cambios en products-data.js
//
// El CSV va en sources/_catalogo/CATALOGO.csv. Las otras dos vías de edición
// son `npm run panel` (aquí, con pantalla) y el panel online en /admin.html
// (para la tienda, desde cualquier sitio y con cuenta de administrador).
//
// LAS TRES DECIDEN LO MISMO: el validador está en netlify/lib/catalogo-hoja.js
// y lo comparten. Este archivo solo pone el CSV y el disco.
//
// Por qué se escribe DENTRO de products-data.js y no se lee el CSV en caliente:
// products-data.js es la ÚNICA lista de productos, y la usan el navegador y las
// funciones de Netlify (que son las que ponen el precio al cobrar). Una segunda
// fuente consultada aparte reabriría el problema que documenta CLAUDE.md: la
// web enseñando un precio que el servidor no reconoce al cobrar.
//
// El stock tiene su propia herramienta (`npm run stock`) porque se actualiza
// mucho más a menudo y desde otro sitio. Las dos escriben en el mismo archivo
// sin pisarse: cada una toca solo sus campos.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');

const hoja = require('../netlify/lib/catalogo-hoja.js');

const RAIZ = path.join(__dirname, '..');
const CATALOGO = path.join(RAIZ, 'products-data.js');
const CARPETA = path.join(RAIZ, 'sources/_catalogo');
const CSV = path.join(CARPETA, 'CATALOGO.csv');
const NO_VENDIBLES = path.join(RAIZ, 'netlify/lib/no-vendibles.js');
const CSV_NOMBRES = path.join(RAIZ, 'sources/productos/NOMBRES_ESPERADOS.csv');

// Excel en español separa por ';' y necesita el BOM para leer bien los acentos.
const BOM = '﻿';
const SEPARADOR = ';';

const { COLUMNAS, escribePrecio, escribeSiNo, comoTextoStock, sinAcentos } = hoja;

const APLICAR = process.argv.includes('--aplicar');
const EXPORTAR = process.argv.includes('--exportar');
const FORZAR = process.argv.includes('--forzar');

// ── Lectura del catálogo ────────────────────────────────────────────────────

function leeCatalogo() {
  delete require.cache[require.resolve(CATALOGO)];
  const modulo = require(CATALOGO);
  return {
    productos: modulo.NUTRETIUM_PRODUCTS,
    categorias: modulo.NUTRETIUM_CATEGORIES,
  };
}

function leeNoVendibles() {
  delete require.cache[require.resolve(NO_VENDIBLES)];
  return require(NO_VENDIBLES);
}

/** La foto tiene que estar en el proyecto o la ficha sale con la imagen rota. */
const existeFoto = (ruta) => fs.existsSync(path.join(RAIZ, ruta));

// ── CSV ─────────────────────────────────────────────────────────────────────

// Excel entrecomilla los campos que llevan el separador dentro, y duplica las
// comillas que ya hubiera. Hay que deshacerlo o un nombre con ';' parte la fila.
function parteCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { entreComillas = true; continue; }
    if (c === SEPARADOR) { fila.push(campo); campo = ''; continue; }
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  fila.push(campo);
  filas.push(fila);

  // Excel deja una línea en blanco al final; no es una fila.
  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

function campoCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function escribeCSV(destino, filas) {
  const texto = BOM + filas.map((f) => f.map(campoCSV).join(SEPARADOR)).join('\r\n') + '\r\n';
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, texto, 'utf8');
}

// ── Exportar ────────────────────────────────────────────────────────────────

function exporta() {
  // El CSV es la hoja de trabajo: sobrescribirla por descuido borraría los
  // cambios a medio hacer. Hay que pedirlo a propósito.
  if (fs.existsSync(CSV) && !FORZAR) {
    console.log(`Ya existe ${path.relative(RAIZ, CSV)} y no lo piso.`);
    console.log('Para rehacerlo con el catálogo actual:');
    console.log('  npm run catalogo -- --exportar --forzar');
    return;
  }

  const { productos } = leeCatalogo();
  const filas = [COLUMNAS, ...productos.map((p) => {
    const fila = hoja.filaDeProducto(p);
    return COLUMNAS.map((c) => fila[c]);
  })];
  escribeCSV(CSV, filas);
  console.log(`Escrito ${path.relative(RAIZ, CSV)} con ${productos.length} productos.`);
  console.log('Ábrelo en Excel, cambia lo que haga falta y luego:  npm run catalogo');
}

// ── Leer la hoja ────────────────────────────────────────────────────────────

function leeFilas() {
  const filas = parteCSV(fs.readFileSync(CSV, 'utf8').replace(BOM, ''));
  const cabecera = filas[0].map((c) => sinAcentos(c).trim().toLowerCase());

  const faltan = COLUMNAS.filter((c) => !cabecera.includes(c));
  if (faltan.length) {
    throw new Error(
      `A ${path.relative(RAIZ, CSV)} le faltan columnas: ${faltan.join(', ')}.\n` +
      `Esperaba la cabecera: ${COLUMNAS.join(SEPARADOR)}\n` +
      'Si la has liado editando, vuelve a sacarla:  npm run catalogo -- --exportar --forzar'
    );
  }

  const indice = {};
  COLUMNAS.forEach((c) => { indice[c] = cabecera.indexOf(c); });

  return filas.slice(1).map((fila, i) => {
    const valores = {};
    COLUMNAS.forEach((c) => { valores[c] = String(fila[indice[c]] ?? '').trim(); });
    valores.__linea = i + 2;   // +1 por la cabecera, +1 porque Excel cuenta desde 1
    return valores;
  });
}

/**
 * Compara la hoja con el catálogo. El validador es el compartido: aquí solo se
 * le da de comer. Las filas se pueden pasar ya leídas — el panel las manda
 * desde el navegador para enseñar el informe ANTES de tocar el CSV.
 */
function calcula(filasDadas) {
  const { productos, categorias } = leeCatalogo();
  return hoja.calcula({
    filas: filasDadas || leeFilas(),
    productos,
    categorias,
    vetados: leeNoVendibles(),
    existeFoto,
  });
}

// ── Escribir ────────────────────────────────────────────────────────────────

function escribeCatalogo(productos) {
  const original = fs.readFileSync(CATALOGO, 'utf8');
  fs.writeFileSync(CATALOGO, hoja.renderiza(productos, original), 'utf8');
}

/** Vuelca a CATALOGO.csv unas filas en forma de objeto. Lo usa el panel. */
function escribeHoja(filas) {
  escribeCSV(CSV, [COLUMNAS, ...filas.map((f) => COLUMNAS.map((c) => f[c] ?? ''))]);
}

/**
 * Reescribe netlify/lib/no-vendibles.js conservando su cabecera explicativa.
 * Lo usa el panel al dar de baja marcando «no volver a publicarlo nunca».
 */
function escribeVetados(lista) {
  const original = fs.readFileSync(NO_VENDIBLES, 'utf8');
  const inicio = original.indexOf('module.exports = [');
  if (inicio === -1) throw new Error('No encuentro la lista dentro de no-vendibles.js.');

  const lineas = lista.map((v) =>
    `  { codigo: ${JSON.stringify(String(v.codigo).trim())}, motivo: ${JSON.stringify(String(v.motivo || '').trim())} },`
  );
  fs.writeFileSync(NO_VENDIBLES,
    original.slice(0, inicio) + 'module.exports = [\n' + lineas.join('\n') + '\n];\n', 'utf8');
}

/**
 * NOMBRES_ESPERADOS.csv dice dónde va la foto de cada producto, y
 * fotos-incorporar.js rechaza los códigos que no estén ahí. Si un alta no entra
 * en esa lista, su foto no se puede incorporar nunca.
 */
function actualizaNombresEsperados(productos) {
  const previas = new Map();
  if (fs.existsSync(CSV_NOMBRES)) {
    fs.readFileSync(CSV_NOMBRES, 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
      .forEach((linea) => {
        const [, codigo, ruta] = linea.split(';');
        if (codigo) previas.set(codigo, ruta);
      });
  }

  const filas = ['categoria;codigo;ruta_esperada;tiene_foto'];
  for (const p of productos) {
    // La ruta previa se respeta: si un producto ya tiene foto en disco y le
    // cambian el nombre, recalcularla dejaría la foto huérfana.
    const ruta = previas.get(p.code) || hoja.rutaEsperada(p);
    filas.push([p.category, p.code, ruta, p.image ? 'si' : 'no'].join(';'));
  }
  fs.writeFileSync(CSV_NOMBRES, filas.join('\n') + '\n', 'utf8');
}

/** Aplica la hoja al catálogo. La usa también el panel local. */
function aplica(filasDadas) {
  const informe = calcula(filasDadas);
  if (informe.errores.length) {
    throw new Error('La hoja tiene errores:\n' + informe.errores.map((e) => '  · ' + e).join('\n'));
  }
  escribeCatalogo(informe.resultado);
  actualizaNombresEsperados(informe.resultado);
  return informe;
}

// ── Informe por pantalla ────────────────────────────────────────────────────

function imprime(informe) {
  const { errores, avisos, altas, bajas, cambios, excluidos, resultado, anteriores } = informe;

  console.log(APLICAR ? '── Aplicando el catálogo ──\n' : '── ENSAYO: no se escribe nada (añade --aplicar) ──\n');

  const vetados = new Set(excluidos.map((e) => e.codigo));

  if (excluidos.length) {
    console.log(`Vetados por netlify/lib/no-vendibles.js — ${excluidos.length}` +
      ' (si estaban publicados, se dan de baja):');
    excluidos.forEach((e) => console.log(`  · ${e.codigo}  ${e.nombre}  — ${e.motivo}`));
    console.log('');
  }

  if (altas.length) {
    console.log(`Altas — ${altas.length}:`);
    altas.forEach((p) => console.log(`  + ${p.code}  ${p.name}  ${escribePrecio(p.price)} €  (${p.category}, id ${p.id})`));
    console.log('');
  }

  const bajasDeLaHoja = bajas.filter((p) => !vetados.has(String(p.code).toUpperCase()));
  if (bajasDeLaHoja.length) {
    console.log(`Bajas — ${bajasDeLaHoja.length}  (estaban en el catálogo y ya no salen en la hoja):`);
    bajasDeLaHoja.forEach((p) => console.log(`  - ${p.code}  ${p.name}`));
    console.log('');
  }

  if (cambios.length) {
    console.log(`Cambios — ${cambios.length}:`);
    cambios.forEach(({ producto, diferencias }) => {
      console.log(`  ~ ${producto.code}  ${producto.name}`);
      diferencias.forEach((d) => console.log(`      ${d}`));
    });
    console.log('');
  }

  if (avisos.length) {
    console.log('Avisos:');
    avisos.forEach((a) => console.log(`  ⚠  ${a}`));
    console.log('');
  }

  if (errores.length) {
    console.log('No se aplica nada: la hoja tiene errores.');
    errores.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('\nCorrige el CSV y vuelve a lanzarlo. Nada se ha escrito.');
    return false;
  }

  if (!altas.length && !bajas.length && !cambios.length) {
    console.log('La hoja dice exactamente lo mismo que el catálogo: no hay nada que hacer.');
    return true;
  }

  console.log(`Catálogo: ${anteriores.length} productos → ${resultado.length}.`);

  if (!APLICAR) {
    console.log('\nNo se ha escrito nada. Si lo de arriba es correcto:');
    console.log('  npm run catalogo -- --aplicar');
  }
  return true;
}

// ── Principal ───────────────────────────────────────────────────────────────

function principal() {
  if (EXPORTAR) { exporta(); return; }

  if (!fs.existsSync(CSV)) {
    console.log(`No existe ${path.relative(RAIZ, CSV)}.`);
    console.log('Sácalo del catálogo actual con:  npm run catalogo -- --exportar');
    process.exitCode = 1;
    return;
  }

  const informe = calcula();
  const correcto = imprime(informe);
  if (!correcto) { process.exitCode = 1; return; }

  if (APLICAR && (informe.altas.length || informe.bajas.length || informe.cambios.length)) {
    escribeCatalogo(informe.resultado);
    actualizaNombresEsperados(informe.resultado);
    console.log('\nHecho. Repasa el diff de products-data.js antes de subirlo.');
    console.log('Si has tocado precios o el carrito, pasa las pruebas:  npm test');
    console.log('Para refrescar la lista de fotos pendientes:  npm run fotos -- --aplicar');
  }
}

if (require.main === module) principal();

module.exports = {
  calcula, aplica, exporta, escribeHoja, escribeVetados,
  escribeCatalogo, actualizaNombresEsperados,
  leeCatalogo, leeNoVendibles, existeFoto,
  escribeCSV, parteCSV,
  escribePrecio, escribeSiNo, comoTextoStock,
  rutaEsperada: hoja.rutaEsperada,
  CSV, NO_VENDIBLES, COLUMNAS, RAIZ,
};
