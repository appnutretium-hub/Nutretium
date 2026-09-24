// IA reparadora — pasar las pruebas y partir cada fallo en CASOS.
//
// La unidad de trabajo no es la suite («falla test:catalogo») sino el caso
// concreto que falla dentro de ella («FALLA rechaza precio negativo»). Cada caso
// tiene su huella, se repara por separado y deja su propio parche. Si la suite
// no marca casos (se para en el primer error), la suite entera es un caso.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { NO_COPIAR } = require('./config');
const { sintaxisValida } = require('./guardian');
const { recorre } = require('./espacio');
const { lanza } = require('./procesos');
const { registra } = require('./bitacora');

const COLOR = /\x1b\[[0-9;]*m/g;
// Cómo marcan un caso fallido las pruebas del proyecto: «  FALLA  x»,
// «FALLO x», «✗ x», y por si acaso los formatos habituales de node:test y TAP.
const MARCA_CASO = /^(?:✗|✘|×|FALLA\b|FALLO\b|FAIL\b|FAILED\b|not ok\b)\s*[:\-–—]?\s*(.*)$/;
// Cabecera de lista: «[api-contracts] FAIL» seguida de « - motivo» por línea.
const CABECERA_LISTA = /^\[[\w:.-]+\]\s*(FAIL|FALLO)/i;
const MARCA_ACIERTO = /^(?:✓|✔|OK\b)/;
const SINTAXIS_OK = 'Sintaxis correcta.';

function leeScripts(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts || {}; } catch { return {}; }
}

/** La línea que mejor describe el fallo de una suite. */
function lineaDelFallo(salida) {
  const lineas = String(salida).replace(COLOR, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Primero el mensaje del error («AssertionError [ERR_ASSERTION]: …»), no la
  // línea de código que Node enseña encima («throw new AssertionError(obj);»).
  return lineas.find((l) => /^(✗|FALLA)/.test(l))
    || lineas.find((l) => /^\w*Error\b[^(]*:\s*\S/.test(l))
    || lineas.find((l) => /AssertionError|SyntaxError|TypeError|ReferenceError|Error:/.test(l))
    || lineas[lineas.length - 1] || 'sin salida';
}

/** Quita lo que cambia de una ejecución a otra (tiempos, hashes) para que la huella sea estable. */
function normaliza(texto) {
  return String(texto).replace(COLOR, '').replace(/\d+(\.\d+)?\s*(ms|s)\b/g, '').replace(/[0-9a-f]{12,}/gi, '').replace(/\s+/g, ' ').trim();
}

function claveDe(suite, texto) {
  return `${suite}:${crypto.createHash('sha256').update(normaliza(texto)).digest('hex').slice(0, 12)}`;
}

/** Parte la salida de una suite que falla en sus casos fallidos. */
function casosFallidos(suite, salida, ok) {
  if (ok) return [];
  const casos = new Map();
  const apunta = (texto) => {
    texto = String(texto).trim().slice(0, 300);
    if (!texto) return;
    const clave = claveDe(suite, texto);
    if (!casos.has(clave)) casos.set(clave, { suite, texto, clave, general: false });
  };
  let enLista = false;
  for (const bruta of String(salida).split(/\r?\n/)) {
    const l = bruta.replace(COLOR, '').trim();
    if (suite === 'sintaxis') { if (/SyntaxError/.test(l)) apunta(l); continue; }
    const m = l.match(MARCA_CASO);
    if (m) { apunta(m[1] || l); enLista = false; continue; }
    if (CABECERA_LISTA.test(l)) { enLista = true; continue; }
    if (enLista && /^-\s+/.test(l)) { apunta(l.replace(/^-\s+/, '')); continue; }
    enLista = false;
  }
  if (!casos.size) {
    const texto = lineaDelFallo(salida).slice(0, 300);
    return [{ suite, texto, clave: claveDe(suite, texto), general: true }];
  }
  return [...casos.values()];
}

function cuentaAciertos(salida) {
  return String(salida).replace(COLOR, '').split(/\r?\n/).filter((l) => MARCA_ACIERTO.test(l.trim())).length;
}

/** Sintaxis de todo el JS del proyecto: detecta un archivo roto antes que cualquier prueba. */
function compruebaSintaxis(dir) {
  const errores = [];
  recorre(dir, dir, new Set([...NO_COPIAR, 'sources']), (rel, abs) => {
    if (!rel.endsWith('.js')) return;
    const error = sintaxisValida(fs.readFileSync(abs, 'utf8'));
    if (error) errores.push(`${rel}: SyntaxError: ${error}`);
  });
  return errores.join('\n') || SINTAXIS_OK;
}

function resultado(nombre, ok, salida, ms) {
  return { nombre, ok, salida, ms, casos: casosFallidos(nombre, salida, ok), aciertos: cuentaAciertos(salida) };
}

/** Pasa una comprobación en `dir` (el espacio aparte; o el proyecto, para ia:probar). */
async function pasaComprobacion(ctx, nombre, dir = ctx.espacio) {
  if (nombre === 'sintaxis') {
    const salida = compruebaSintaxis(dir);
    return resultado(nombre, salida === SINTAXIS_OK, salida, 0);
  }
  const r = await lanza(`npm run -s ${nombre}`, dir, ctx.tiempoPruebaMs);
  const salida = r.agotado ? `${r.salida}\n[ia-reparador] La prueba no terminó en ${Math.round(ctx.tiempoPruebaMs / 1000)} s.` : r.salida;
  return resultado(nombre, r.codigo === 0 && !r.agotado, salida, r.ms);
}

async function pasaTodas(ctx, nombres = ctx.comprobaciones) {
  const resultados = [];
  for (const nombre of nombres) {
    const r = await pasaComprobacion(ctx, nombre);
    resultados.push(r);
    registra(ctx, `  ${r.ok ? 'OK   ' : `FALLA (${r.casos.length} caso${r.casos.length === 1 ? '' : 's'})`} ${nombre}${r.ms ? ` (${Math.round(r.ms / 1000)} s)` : ''}`);
  }
  return resultados;
}

/**
 * ¿La suite, repetida tras el cambio, da por arreglado ESTE caso sin romper
 * otro? Devuelve el motivo si no, o null si sí.
 *
 * Si la suite se para en el primer error, arreglar un caso destapa el
 * siguiente: eso no es romperlo. Se distingue contando aciertos — si hay más
 * casos en verde que antes, lo nuevo que falla es lo que antes no llegaba a
 * ejecutarse; si hay los mismos o menos, el cambio ha roto algo.
 */
function comparaSuite(caso, antes, despues) {
  if (despues.ok) return null;
  if (caso.general) return `la comprobación sigue fallando: ${lineaDelFallo(despues.salida).slice(0, 300)}`;
  if (despues.casos.some((c) => c.clave === caso.clave)) return `el caso sigue fallando: ${caso.texto}`;
  const previos = new Set(antes.casos.map((c) => c.clave));
  const nuevos = despues.casos.filter((c) => !previos.has(c.clave));
  if (despues.aciertos < antes.aciertos) return `arregla el caso pero rompe otro de ${caso.suite}: ${(nuevos[0] || despues.casos[0]).texto}`;
  if (nuevos.length && despues.aciertos <= antes.aciertos) return `arregla el caso pero rompe otro de ${caso.suite}: ${nuevos[0].texto}`;
  return null;
}

module.exports = { leeScripts, lineaDelFallo, claveDe, casosFallidos, cuentaAciertos, pasaComprobacion, pasaTodas, comparaSuite };
