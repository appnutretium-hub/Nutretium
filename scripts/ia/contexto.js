// IA reparadora — qué archivos enseñarle a los agentes para un caso concreto.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MAX_ARCHIVO_PROMPT } = require('./config');
const { esPrueba, esEditable, normalizaRuta } = require('./guardian');
const { existe } = require('./espacio');
const { leeScripts } = require('./comprobaciones');

/**
 * Hasta 3 archivos editables y 1 prueba de contexto. Primero las rutas que
 * cita el propio caso, luego las de la salida entera, luego la prueba de
 * package.json y lo que esa prueba carga, ordenado por parecido con el caso.
 */
function archivosDelFallo(ctx, r, caso) {
  const dir = ctx.espacio;
  const rutas = new Map(); // rel → líneas citadas
  const apunta = (rel, linea) => {
    rel = normalizaRuta(rel);
    if (!rel || rel.startsWith('node_modules/') || !existe(dir, rel)) return;
    if (!rutas.has(rel)) rutas.set(rel, new Set());
    if (linea) rutas.get(rel).add(Number(linea));
  };

  const base = dir.replace(/\\/g, '/');
  const re = /((?:[A-Za-z]:)?[\w./\\ -]*?[\w-]+\.(?:js|html|css))(?::(\d+))?/g;
  for (const texto of [caso.texto, r.salida]) {
    for (const m of String(texto).replace(/\\/g, '/').matchAll(re)) {
      let rel = m[1].trim();
      const pos = rel.indexOf(base);
      if (pos >= 0) rel = rel.slice(pos + base.length + 1);
      apunta(rel, m[2]);
    }
  }

  const comando = String(leeScripts(dir)[r.nombre] || '');
  for (const m of comando.matchAll(/[\w./-]+\.js/g)) apunta(m[0]);

  const palabras = new Set(String(caso.texto).toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((p) => p.length > 3));
  const cargados = [];
  for (const prueba of [...rutas.keys()].filter(esPrueba)) {
    const codigo = fs.readFileSync(path.join(dir, prueba), 'utf8');
    for (const m of codigo.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      let rel = normalizaRuta(path.posix.join(path.posix.dirname(prueba), m[1]));
      if (!path.extname(rel)) rel += '.js';
      if (!existe(dir, rel) || esPrueba(rel)) continue;
      const nombre = path.basename(rel, '.js').toLowerCase().split(/[^a-z0-9]+/);
      cargados.push({ rel, parecido: nombre.filter((p) => palabras.has(p)).length });
    }
  }
  cargados.sort((a, b) => b.parecido - a.parecido);

  const editables = [...rutas.keys()].filter((rel) => esEditable(rel, dir));
  for (const { rel } of cargados) if (editables.length < 3 && !editables.includes(rel)) editables.push(rel);
  const contexto = [...rutas.keys()].filter(esPrueba).slice(0, 1);
  return { editables: editables.slice(0, 3), contexto, lineas: rutas };
}

/**
 * Huella de los archivos implicados. Si un error quedó «sin resolver» y luego
 * alguien toca esos archivos, la huella cambia y se le da otra oportunidad.
 */
function huellaArchivos(ctx, rels) {
  const h = crypto.createHash('sha256');
  for (const rel of [...rels].sort()) {
    h.update(rel);
    try { h.update(fs.readFileSync(path.join(ctx.espacio, rel))); } catch { /* ya no existe */ }
  }
  return h.digest('hex').slice(0, 16);
}

/** Un archivo largo se recorta alrededor de las líneas citadas en el error. */
function extracto(texto, lineas) {
  if (texto.length <= MAX_ARCHIVO_PROMPT) return texto;
  const filas = texto.split('\n');
  const citadas = [...(lineas || [])].filter((n) => n > 0 && n <= filas.length);
  if (citadas.length) {
    const centro = citadas[0] - 1;
    let ini = centro;
    let fin = centro;
    let largo = filas[centro].length;
    while (largo < MAX_ARCHIVO_PROMPT && (ini > 0 || fin < filas.length - 1)) {
      if (ini > 0) largo += filas[--ini].length + 1;
      if (fin < filas.length - 1) largo += filas[++fin].length + 1;
    }
    return `[… líneas ${ini + 1}–${fin + 1} de ${filas.length} …]\n${filas.slice(ini, fin + 1).join('\n')}`;
  }
  return `${texto.slice(0, MAX_ARCHIVO_PROMPT)}\n[… recortado: el archivo sigue …]`;
}

/** La parte de la salida que habla de este caso, no la suite entera. */
function salidaDelCaso(salida, caso) {
  const s = String(salida);
  const pos = caso.general ? -1 : s.indexOf(caso.texto);
  if (pos < 0) return s.slice(-5000);
  return s.slice(Math.max(0, pos - 1500), pos + 3500);
}

module.exports = { archivosDelFallo, huellaArchivos, extracto, salidaDelCaso };
