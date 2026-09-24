// Etapa 4 — REVISIÓN DE CÓDIGO.
//
// Lee el cambio como lo leería un compañero antes de aprobar un PR, y separa
// dos cosas:
//
//   bloqueantes   lo que impide darlo por bueno: tapa el síntoma en vez de
//                 arreglar la causa, incumple un criterio del plan, relaja una
//                 comprobación. Vuelve a la implementación con el motivo.
//   sugerencias   mejoras que no impiden publicar (un nombre, un comentario,
//                 un caso límite). Se atienden DESPUÉS del release, en la etapa
//                 7, como un parche aparte que también tiene que pasar QA.
//
// Primero pasa un filtro mecánico (sinTrampas): lo evidente no gasta una
// consulta. Si la IA no contesta, se aprueba sin sugerencias: las pruebas de
// la etapa 5 siguen mandando, y la revisión suma, no bloquea el trabajo.
'use strict';

const { extraeJSON } = require('../guardian');
const { preguntaOllama } = require('../ollama');
const criterios = require('../criterios');

const SISTEMA = `Eres el REVISOR DE CÓDIGO de NUTRETIUM, una tienda online (Node.js 22, funciones de Netlify, HTML y JS sin framework). Te paso un tiquet de error, su plan con los criterios de aceptación y el cambio propuesto. Revísalo como un PR.

Bloqueante es solo lo que impide aprobarlo: esconde el síntoma en vez de arreglar la causa (valores fijos para contentar a la prueba, try/catch que callan el error, returns tempranos que se saltan la lógica, comprobaciones quitadas), incumple un criterio, o relaja la seguridad. Lo demás son sugerencias. Si el cambio es razonable, apruébalo: rechazar un arreglo bueno también cuesta.

Responde SOLO con JSON:
{"aprobado":true,"motivo":"por qué, en una frase","bloqueantes":[],"sugerencias":["mejora opcional concreta"],"criterios":{"CA-7":true},"comoProbar":"qué mirar para comprobarlo a mano, en una o dos frases sencillas"}`;

const RE_CATCH_VACIO = /catch\s*(\(\w*\))?\s*\{\s*\}/;

/** Trampas que se ven sin preguntar a nadie. Devuelve el motivo o null. */
function sinTrampas(cambios) {
  for (const c of cambios) {
    const antes = String(c.buscar);
    const despues = String(c.reemplazar);
    if (RE_CATCH_VACIO.test(despues) && !RE_CATCH_VACIO.test(antes)) return `${c.archivo}: añade un catch vacío que esconde el error`;
    if (/^\s*(return\s+)?(true|false|\d+|'[^']*'|"[^"]*")\s*;?\s*$/.test(despues) && antes.trim().length > despues.trim().length) return `${c.archivo}: sustituye la lógica por un valor fijo`;
    if (!despues.trim() && /\bif\s*\(|throw\b/.test(antes)) return `${c.archivo}: borra una comprobación en vez de arreglarla`;
  }
  return null;
}

function prompt(t, plan, propuesta) {
  return [
    `CASO QUE FALLABA: ${t.suite} — ${t.caso}`,
    t.causa ? `CAUSA SEGÚN EL TIQUET: ${t.causa}` : 'CAUSA: sin determinar',
    `PLAN: ${plan.objetivo}`,
    `CRITERIOS QUE TE TOCA COMPROBAR:\n${[...plan.mapa.filter((c) => c.id === 'CA-5'), ...criterios.propios(plan.mapa)].map((c) => `- ${c.id}: ${c.criterio}`).join('\n')}`,
    `DIAGNÓSTICO DEL IMPLEMENTADOR: ${propuesta.diagnostico || '—'}`,
    `CAMBIO:\n${propuesta.cambios.map((c) => `${c.archivo}\n--- antes\n${c.buscar}\n+++ después\n${c.reemplazar}`).join('\n\n')}`,
  ].join('\n\n');
}

const textos = (x, n) => (Array.isArray(x) ? x : []).map((s) => String(s || '').trim().slice(0, 300)).filter(Boolean).slice(0, n);

/**
 * Revisa el cambio y marca en el mapa CA-5 y los criterios del plan.
 * Devuelve {aprobado, motivo, bloqueantes, sugerencias, comoProbar}.
 */
async function revisa(ctx, t, plan, propuesta) {
  const trampa = sinTrampas(propuesta.cambios);
  if (trampa) {
    criterios.marca(plan.mapa, 'CA-5', 'no cumple', trampa);
    return { aprobado: false, motivo: trampa, bloqueantes: [trampa], sugerencias: [], comoProbar: '' };
  }
  const texto = await preguntaOllama(ctx, SISTEMA, prompt(t, plan, propuesta));
  const j = (texto != null && extraeJSON(texto)) || {};
  const bloqueantes = textos(j.bloqueantes, 5);
  const incumplidos = criterios.propios(plan.mapa).filter((c) => j.criterios?.[c.id] === false);
  for (const c of incumplidos) bloqueantes.push(`incumple ${c.id}: ${c.criterio}`);
  if (j.aprobado === false && !bloqueantes.length && String(j.motivo || '').trim()) bloqueantes.push(String(j.motivo).slice(0, 300));

  const aprobado = !bloqueantes.length;
  // Sin respuesta válida no se bloquea el trabajo (QA sigue mandando), pero
  // tampoco se da por comprobado lo que nadie ha mirado: queda pendiente.
  const sinRevision = !Object.keys(j).length;
  if (sinRevision) {
    const motivo = 'sin revisión: la IA no dio una respuesta válida';
    criterios.marca(plan.mapa, 'CA-5', 'pendiente', `sin trampas evidentes; ${motivo}`);
    for (const c of criterios.propios(plan.mapa)) criterios.marca(plan.mapa, c.id, 'pendiente', motivo);
    return { aprobado: true, motivo, bloqueantes: [], sugerencias: [], comoProbar: '' };
  }
  criterios.marca(plan.mapa, 'CA-5', aprobado ? 'cumple' : 'no cumple', aprobado ? 'sin trampas; revisión aprobada' : bloqueantes[0]);
  for (const c of criterios.propios(plan.mapa)) {
    const dicho = j.criterios?.[c.id];
    criterios.marca(plan.mapa, c.id, dicho === false ? 'no cumple' : 'cumple', dicho === true ? 'confirmado por la revisión' : dicho === false ? 'la revisión dice que no' : 'la revisión no lo objetó');
  }
  return {
    aprobado,
    motivo: String(j.motivo || (aprobado ? 'la revisión no encuentra bloqueantes' : bloqueantes[0])).slice(0, 400),
    bloqueantes, sugerencias: aprobado ? textos(j.sugerencias, 3) : [],
    comoProbar: String(j.comoProbar || '').slice(0, 400),
  };
}

module.exports = { revisa, sinTrampas, SISTEMA };
