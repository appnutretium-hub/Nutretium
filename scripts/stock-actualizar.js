// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — actualiza el stock del catálogo desde un CSV
//
// El stock venía congelado del listado del ERP del 05/08/2026 y no había forma
// de refrescarlo sin regenerar el catálogo entero. Esto lo desacopla: el CSV es
// la fuente del stock, y se puede pasar tantas veces como haga falta.
//
//   npm run stock -- --exportar    escribe el CSV con el stock actual
//   npm run stock                  ensayo: enseña qué cambiaría, no toca nada
//   npm run stock -- --aplicar     escribe el stock en products-data.js
//
// El CSV va en sources/_stock/STOCK.csv. Formato y casos raros, en el LEEME.md
// de esa carpeta.
//
// Por qué el stock se escribe en products-data.js y no se lee en caliente:
// products-data.js es la ÚNICA lista de productos, y la usan el navegador y las
// funciones de Netlify (que son las que ponen el precio al cobrar). Meter una
// segunda fuente de stock consultada aparte reabriría justo el problema que
// documenta CLAUDE.md: la web enseñando una cosa y el servidor otra.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CATALOGO = path.join(RAIZ, 'products-data.js');
const CARPETA = path.join(RAIZ, 'sources/_stock');
const CSV = path.join(CARPETA, 'STOCK.csv');

const APLICAR = process.argv.includes('--aplicar');
const EXPORTAR = process.argv.includes('--exportar');

// Excel en español separa por ';' y necesita el BOM para leer bien los acentos.
const BOM = '﻿';
const SEPARADOR = ';';

// Lo que se escribe en la columna 'stock' para decir «este no se controla».
const SIN_CONTROL = new Set(['siempre', 'always', 'sin control', 'ilimitado', '-', 'null']);

function leeProductos() {
  delete require.cache[require.resolve(CATALOGO)];
  return require(CATALOGO).NUTRETIUM_PRODUCTS;
}

function comoTexto(stock) {
  return (stock === null || stock === undefined) ? 'siempre' : String(stock);
}

// ── Exportar ────────────────────────────────────────────────────────────────

// Saca el estado actual para poder abrirlo en Excel, cambiar cuatro números y
// volver a pasarlo. Es el punto de partida de cada actualización.
function exporta() {
  // El CSV es donde la tienda lleva su stock: sobrescribirlo por descuido
  // borraría el trabajo del día. Hay que pedirlo a propósito.
  if (fs.existsSync(CSV) && !process.argv.includes('--forzar')) {
    console.log(`Ya existe ${path.relative(RAIZ, CSV)} y no lo piso.`);
    console.log('Para rehacerlo con el estado actual del catálogo:');
    console.log('  npm run stock -- --exportar --forzar');
    return;
  }
  const productos = leeProductos();
  const filas = [['codigo', 'nombre', 'categoria', 'stock'].join(SEPARADOR)];
  productos.forEach((p) => {
    filas.push([
      p.code,
      p.name.replace(new RegExp(SEPARADOR, 'g'), ','),
      p.category,
      comoTexto(p.stock),
    ].join(SEPARADOR));
  });
  fs.mkdirSync(CARPETA, { recursive: true });
  fs.writeFileSync(CSV, BOM + filas.join('\n') + '\n', 'utf8');
  console.log(`${productos.length} productos → ${path.relative(RAIZ, CSV)}`);
  console.log('Ábrelo en Excel, cambia la columna "stock" y guárdalo como CSV.');
}

// ── Leer el CSV ─────────────────────────────────────────────────────────────

function leeCsv() {
  if (!fs.existsSync(CSV)) {
    console.log(`No existe ${path.relative(RAIZ, CSV)}.`);
    console.log('Créalo con el estado actual del catálogo:');
    console.log('  npm run stock -- --exportar');
    return null;
  }

  const texto = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) {
    console.log('El CSV está vacío.');
    return null;
  }

  // La cabecera manda: así da igual el orden de las columnas y que el ERP
  // exporte campos de más.
  const cabecera = lineas[0].split(SEPARADOR).map((c) => c.trim().toLowerCase());
  const colCodigo = cabecera.findIndex((c) => c === 'codigo' || c === 'código' || c === 'code');
  const colStock = cabecera.findIndex((c) => c === 'stock' || c === 'stock(gen)' || c === 'existencias');

  if (colCodigo < 0 || colStock < 0) {
    console.log(`El CSV necesita una columna "codigo" y otra "stock". Encontré: ${cabecera.join(', ')}`);
    console.log(`(el separador debe ser "${SEPARADOR}", que es el que usa Excel en español)`);
    return null;
  }

  const filas = [];
  lineas.slice(1).forEach((linea, i) => {
    const celdas = linea.split(SEPARADOR);
    const codigo = (celdas[colCodigo] || '').trim();
    if (!codigo) return;
    filas.push({ linea: i + 2, codigo, stock: (celdas[colStock] || '').trim() });
  });
  return filas;
}

// Convierte la celda a lo que va en el catálogo: un entero, null (sin control),
// o un aviso si no se entiende. Nunca adivina.
function interpreta(celda) {
  const limpio = celda.trim().toLowerCase();
  if (!limpio) return { saltar: true, motivo: 'celda vacía' };
  if (SIN_CONTROL.has(limpio)) return { valor: null };

  const numero = Number(limpio.replace(',', '.'));
  if (!Number.isFinite(numero)) return { error: `"${celda}" no es un número ni "siempre"` };
  if (!Number.isInteger(numero)) return { error: `"${celda}" tiene decimales; el stock va en unidades enteras` };
  // El ERP saca negativos cuando se ha vendido sin dar entrada. En la web un
  // negativo y un 0 son lo mismo (agotado), así que se normaliza a 0 y se avisa.
  if (numero < 0) return { valor: 0, aviso: `venía ${numero} (negativo en el ERP) → se publica como 0` };
  return { valor: numero };
}

// ── Escribir en el catálogo ─────────────────────────────────────────────────

// products-data.js tiene un producto por línea. Se cambia solo el "stock" de la
// línea de cada código: el archivo se puede seguir regenerando desde el PDF y el
// cambio se revisa de un vistazo en el diff.
function escribe(cambios) {
  const lineas = fs.readFileSync(CATALOGO, 'utf8').split('\n');
  let tocadas = 0;

  const nuevas = lineas.map((linea) => {
    const cambio = cambios.find((c) => linea.includes(`"code":"${c.codigo}"`));
    if (!cambio) return linea;
    const valor = cambio.nuevo === null ? 'null' : String(cambio.nuevo);
    const cambiada = linea.replace(/"stock":(-?\d+|null)/, `"stock":${valor}`);
    if (cambiada !== linea) tocadas++;
    return cambiada;
  });

  if (tocadas !== cambios.length) {
    throw new Error(`esperaba cambiar ${cambios.length} líneas y cambié ${tocadas}: no se ha escrito nada`);
  }
  fs.writeFileSync(CATALOGO, nuevas.join('\n'), 'utf8');
}

// ── Principal ───────────────────────────────────────────────────────────────

function principal() {
  if (EXPORTAR) return exporta();

  const filas = leeCsv();
  if (!filas) return;

  const productos = leeProductos();
  const porCodigo = new Map(productos.map((p) => [p.code.toUpperCase(), p]));

  const cambios = [];
  const iguales = [];
  const problemas = [];
  const avisos = [];
  const vistos = new Set();

  filas.forEach((fila) => {
    const producto = porCodigo.get(fila.codigo.toUpperCase());
    if (!producto) {
      problemas.push(`línea ${fila.linea}: el código "${fila.codigo}" no está en el catálogo`);
      return;
    }
    if (vistos.has(producto.code)) {
      problemas.push(`línea ${fila.linea}: el código "${fila.codigo}" aparece dos veces`);
      return;
    }
    vistos.add(producto.code);

    const leido = interpreta(fila.stock);
    if (leido.error) {
      problemas.push(`línea ${fila.linea} (${producto.code}): ${leido.error}`);
      return;
    }
    if (leido.saltar) return;
    if (leido.aviso) avisos.push(`${producto.code} ${producto.name}: ${leido.aviso}`);

    const actual = producto.stock === undefined ? null : producto.stock;
    if (actual === leido.valor) { iguales.push(producto.code); return; }

    cambios.push({
      codigo: producto.code,
      nombre: producto.name,
      antes: actual,
      nuevo: leido.valor,
    });
  });

  const noVenian = productos.filter((p) => !vistos.has(p.code));

  // ── Informe ──
  if (problemas.length) {
    console.log('── Problemas en el CSV ──');
    problemas.forEach((p) => console.log(`✗ ${p}`));
    console.log('\nNo se aplica nada hasta que el CSV esté limpio.');
    return;
  }

  console.log(APLICAR ? '── Actualizando stock ──\n' : '── ENSAYO: no se escribe nada (añade --aplicar) ──\n');

  const disponible = (v) => (v === null || v > 0);
  if (!cambios.length) {
    console.log('El CSV coincide con el catálogo: no hay nada que cambiar.');
  } else {
    cambios.forEach((c) => {
      const flecha = disponible(c.antes) === disponible(c.nuevo) ? ' '
        : (disponible(c.nuevo) ? '↑' : '↓');
      console.log(`${flecha || ' '} ${c.codigo}  ${c.nombre}`);
      console.log(`   ${comoTexto(c.antes)} → ${comoTexto(c.nuevo)}`);
    });
  }

  if (avisos.length) {
    console.log('\n── Avisos ──');
    avisos.forEach((a) => console.log(`⚠  ${a}`));
  }

  if (noVenian.length) {
    console.log(`\n${noVenian.length} producto(s) del catálogo no venían en el CSV: se quedan como estaban.`);
    if (noVenian.length <= 12) noVenian.forEach((p) => console.log(`   ${p.code}  ${p.name}`));
  }

  if (APLICAR && cambios.length) {
    try {
      escribe(cambios);
    } catch (err) {
      console.log(`\n✗ ${err.message}`);
      return;
    }
  }

  // Cómo queda la tienda, que es lo que de verdad importa mirar.
  const despues = APLICAR ? leeProductos() : productos.map((p) => {
    const c = cambios.find((x) => x.codigo === p.code);
    return c ? { ...p, stock: c.nuevo } : p;
  });
  const aLaVenta = despues.filter((p) => disponible(p.stock === undefined ? null : p.stock)).length;
  const antes = productos.filter((p) => disponible(p.stock === undefined ? null : p.stock)).length;

  console.log(`\nProductos a la venta: ${antes} → ${aLaVenta} de ${productos.length}.`);

  if (!APLICAR) {
    console.log('\nNo se ha escrito nada. Si el resumen de arriba es correcto:');
    console.log('  npm run stock -- --aplicar');
  } else if (cambios.length) {
    console.log('\nHecho. Repasa el diff de products-data.js, y no olvides desplegar:');
    console.log('  el stock viaja en products-data.js, así que hasta que no subas no cambia la web.');
  }
}

principal();
