// Etapa 3 — IMPLEMENTACIÓN. Rápida y fiel.
//
// Rápida: trabaja sobre el archivo que señaló el tiquet, sigue el plan y sabe
// qué intentos se descartaron antes, así que no los repite. Fiel: escribe el
// cambio MÍNIMO que cumple el plan, y lo aplica en el espacio aparte pasando
// por el guardián y por node --check (CA-4). Que esté terminado de verdad no lo
// decide ella: lo deciden la revisión (4) y las pruebas (5).
'use strict';

const fs = require('fs');
const path = require('path');
const { MAX_CAMBIOS } = require('../config');
const { extraeJSON } = require('../guardian');
const { extracto, salidaDelCaso } = require('../contexto');
const { preguntaOllama } = require('../ollama');
const { aplicaPlan } = require('../cambios');

const REGLAS = `Reglas que no se negocian:
- Nunca modifiques pruebas (archivos test-*, carpeta tests/, *.spec.js): la prueba es la especificación. Si crees que la prueba está mal, dilo en el diagnóstico y deja "cambios" vacío.
- No relajes comprobaciones de seguridad, sesión, administrador, firma ni límites para que pase una prueba.
- No inventes valores por defecto para secretos, claves ni tokens: sin credencial se falla cerrado (503).
- El precio lo calcula el servidor desde products-data.js; ese archivo no se toca.
- No crees archivos nuevos: edita solo los archivos que te enseño como editables.
- Arregla SOLO el caso que te indico. Si hay otros fallos en la misma comprobación, se atienden aparte, uno por uno.
- Arregla la causa, no el síntoma: nada de valores fijos para contentar a la prueba ni try/catch que escondan el error.
- Los textos para el usuario van en castellano.`;

const SISTEMA = `Eres el IMPLEMENTADOR, un programador sénior que repara errores en NUTRETIUM, una tienda online (Node.js 22, funciones de Netlify, HTML y JS sin framework). Te paso UN tiquet con su causa, el plan con sus criterios de aceptación y los archivos implicados. Escribe el cambio MÍNIMO que cumple el plan.

${REGLAS}

Responde SOLO con JSON, sin texto alrededor:
{"diagnostico":"causa y arreglo en una o dos frases","cambios":[{"archivo":"ruta/relativa.js","buscar":"texto exacto copiado del archivo","reemplazar":"texto nuevo"}]}
"buscar" tiene que aparecer UNA sola vez en el archivo, copiado carácter a carácter (espacios incluidos). Máximo ${MAX_CAMBIOS} cambios.`;

function prompt(ctx, r, caso, archivos, t, plan, encargo) {
  const partes = [`COMPROBACIÓN: npm run ${r.nombre}`, `CASO QUE FALLA (arregla solo este): ${caso.texto}`];
  if (t?.causa) partes.push(`TIQUET: ${t.causa}${t.archivo ? `\nArchivo: ${t.archivo}${t.lineas?.length ? `, líneas ${t.lineas.join(', ')}` : ''}` : ''}${t.evidencia ? `\nEvidencia: ${t.evidencia}` : ''}`);
  if (plan) partes.push(`PLAN: ${plan.objetivo}\n${plan.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nCRITERIOS DE ACEPTACIÓN:\n${plan.mapa.map((c) => `- ${c.id}: ${c.criterio}`).join('\n')}`);
  if (encargo) partes.push(encargo);
  partes.push(`SALIDA:\n${salidaDelCaso(r.salida, caso)}`);
  const lee = (rel) => extracto(fs.readFileSync(path.join(ctx.espacio, rel), 'utf8'), archivos.lineas.get(rel));
  for (const rel of archivos.editables) partes.push(`ARCHIVO EDITABLE: ${rel}\n\`\`\`\n${lee(rel)}\n\`\`\``);
  for (const rel of archivos.contexto) partes.push(`PRUEBA (solo lectura, NO se edita): ${rel}\n\`\`\`\n${lee(rel)}\n\`\`\``);
  return partes;
}

/**
 * Pide el cambio. Devuelve {diagnostico, cambios}, {invalido: true} si no era
 * JSON, o null si no hubo respuesta. `encargo` sustituye la tarea: lo usa la
 * etapa 7 para atender las sugerencias de la revisión.
 */
async function propone(ctx, r, caso, archivos, t, plan, previos, encargo = null) {
  const partes = prompt(ctx, r, caso, archivos, t, plan, encargo);
  if (previos.length) partes.push(`INTENTOS ANTERIORES QUE NO VALIERON (no los repitas):\n${previos.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
  const texto = await preguntaOllama(ctx, SISTEMA, partes.join('\n\n'));
  if (texto == null) return null;
  return extraeJSON(texto) || { invalido: true };
}

/** Aplica la propuesta en el espacio aparte (CA-4). Devuelve lo mismo que aplicaPlan. */
const aplica = (ctx, propuesta) => aplicaPlan(ctx, propuesta);

module.exports = { propone, aplica, SISTEMA, REGLAS };
