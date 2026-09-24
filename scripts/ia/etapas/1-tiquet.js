// Etapa 1 — RECIBE EL TIQUET Y LO ENRIQUECE.
//
// Un caso que falla llega en bruto: una línea de la salida de una prueba. Aquí
// se convierte en un tiquet con todo lo que harán falta las demás etapas: qué
// comprobación, qué salida, qué archivos, qué historial tiene ese error en el
// registro, y la CAUSA — que la busca la IA sin escribir código: archivo,
// líneas y evidencia. Se enriquece una vez por error y solo se repite si
// cambian los archivos implicados.
'use strict';

const fs = require('fs');
const path = require('path');
const { extraeJSON, esEditable, normalizaRuta } = require('../guardian');
const { extracto, salidaDelCaso } = require('../contexto');
const { existe } = require('../espacio');
const { preguntaOllama } = require('../ollama');
const { debeParar } = require('../bitacora');
const tiquets = require('../tiquets');

const SISTEMA = `Eres el ANALISTA que recibe los tiquets de error de NUTRETIUM, una tienda online (Node.js 22, funciones de Netlify, HTML y JS sin framework). Te paso UN caso de prueba que falla, su salida y los archivos implicados. Tu trabajo es enriquecer el tiquet encontrando la CAUSA, no arreglarla: no escribas código.

Responde SOLO con JSON:
{"causa":"qué falla y por qué, en una o dos frases","archivo":"ruta/relativa.js donde está el error","lineas":[12,13],"evidencia":"la línea o condición concreta que lo demuestra","alcance":"qué más puede verse afectado por este error","confianza":"alta|media|baja"}
Si la prueba parece estar mal y no el código, dilo en "causa" y deja "archivo" vacío.`;

function prompt(ctx, r, caso, archivos) {
  const partes = [`COMPROBACIÓN: npm run ${r.nombre}`, `CASO QUE FALLA: ${caso.texto}`, `SALIDA:\n${salidaDelCaso(r.salida, caso)}`];
  for (const rel of [...archivos.editables, ...archivos.contexto]) {
    partes.push(`ARCHIVO: ${rel}\n\`\`\`\n${extracto(fs.readFileSync(path.join(ctx.espacio, rel), 'utf8'), archivos.lineas.get(rel))}\n\`\`\``);
  }
  return partes.join('\n\n');
}

/** Pregunta la causa. Devuelve {causa, archivo, lineas, evidencia, alcance, confianza} o null. */
async function enriquece(ctx, r, caso, archivos) {
  const texto = await preguntaOllama(ctx, SISTEMA, prompt(ctx, r, caso, archivos));
  const j = texto == null ? null : extraeJSON(texto);
  if (!j || !String(j.causa || '').trim()) return null;
  const archivo = normalizaRuta(j.archivo);
  return {
    causa: String(j.causa).slice(0, 500),
    archivo: archivo && existe(ctx.espacio, archivo) && esEditable(archivo, ctx.espacio) ? archivo : null,
    lineas: (Array.isArray(j.lineas) ? j.lineas : []).filter(Number.isInteger).slice(0, 10),
    evidencia: String(j.evidencia || '').slice(0, 500),
    alcance: String(j.alcance || '').slice(0, 300),
    confianza: ['alta', 'media', 'baja'].includes(j.confianza) ? j.confianza : 'baja',
  };
}

/**
 * Recibe el tiquet: lo enriquece (o reutiliza lo ya averiguado si los archivos
 * no han cambiado), lo guarda en el registro y escribe 01-TIQUET.md.
 * Devuelve el tiquet, o null si hay que parar.
 */
async function recibe(ctx, r, caso, archivos, e, huella) {
  if (!e.tiquet || e.tiquet.huella !== huella) {
    const hallado = await enriquece(ctx, r, caso, archivos);
    if (hallado == null && debeParar(ctx)) return null;
    e.tiquet = { ...(hallado || { causa: null }), huella, recibido: new Date().toISOString() };
  }
  const t = {
    ...e.tiquet, suite: caso.suite, caso: caso.texto, clave: caso.clave,
    editables: archivos.editables, contexto: archivos.contexto,
    carpeta: tiquets.relativa(ctx, caso),
  };
  tiquets.escribe(ctx, caso, 1, [
    `# Tiquet \`${caso.suite}\` · ${caso.clave}`, '',
    `**Caso que falla:** ${caso.texto}`, '',
    `**Cómo reproducirlo:** \`npm run ${caso.suite}\``, '',
    '## Enriquecido', '',
    t.causa ? `- **Causa:** ${t.causa}` : '- **Causa:** la IA no llegó a una conclusión; se trabaja con la salida de la prueba',
    ...(t.archivo ? [`- **Dónde:** \`${t.archivo}\`${t.lineas?.length ? `, líneas ${t.lineas.join(', ')}` : ''}`] : []),
    ...(t.evidencia ? [`- **Evidencia:** ${t.evidencia}`] : []),
    ...(t.alcance ? [`- **Alcance:** ${t.alcance}`] : []),
    ...(t.causa ? [`- **Confianza:** ${t.confianza}`] : []),
    '', '## Archivos', '',
    ...t.editables.map((rel) => `- editable: \`${rel}\``),
    ...t.contexto.map((rel) => `- prueba (solo lectura): \`${rel}\``),
    '', '## Historial en el registro', '',
    `- visto por primera vez: ${e.visto}`,
    `- intentos hasta ahora: ${e.intentos}`,
    ...(e.previos.length ? ['- intentos que no valieron:', ...e.previos.map((p) => `  - ${p}`)] : []),
    '', '## Salida de la prueba', '', tiquets.cerca(salidaDelCaso(r.salida, caso).slice(-3000)),
  ]);
  return t;
}

/** Pone el archivo señalado el primero y apunta sus líneas: el implementador lo verá antes que nada. */
function enfoca(archivos, t) {
  if (!t?.archivo) return archivos;
  const editables = [t.archivo, ...archivos.editables.filter((rel) => rel !== t.archivo)].slice(0, 3);
  const lineas = new Map(archivos.lineas);
  lineas.set(t.archivo, new Set([...(t.lineas || []), ...(lineas.get(t.archivo) || [])]));
  return { ...archivos, editables, lineas };
}

module.exports = { recibe, enriquece, enfoca, SISTEMA };
