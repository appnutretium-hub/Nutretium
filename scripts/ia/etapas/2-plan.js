// Etapa 2 — EL PLAN, en .md, con su MAPA DE CRITERIOS DE ACEPTACIÓN.
//
// Antes de tocar código se decide qué se va a hacer y cómo se sabrá que está
// terminado. El mapa lleva seis criterios fijos que comprueba una máquina
// (criterios.js) y hasta tres propios de este tiquet que propone la IA y lee
// la revisión de código. Se planifica una vez por error, como el tiquet.
'use strict';

const { extraeJSON } = require('../guardian');
const { preguntaOllama } = require('../ollama');
const criterios = require('../criterios');
const { debeParar } = require('../bitacora');
const tiquets = require('../tiquets');

const SISTEMA = `Eres el PLANIFICADOR de NUTRETIUM, una tienda online (Node.js 22, funciones de Netlify, HTML y JS sin framework). Te paso un tiquet de error ya analizado. Escribe el plan para arreglarlo con el cambio MÍNIMO, sin tocar pruebas, precios (products-data.js) ni secretos, y los criterios que demostrarán que está bien hecho.

Responde SOLO con JSON:
{"objetivo":"qué quedará arreglado, en una frase","pasos":["paso concreto 1","paso 2"],"riesgos":["qué podría romperse"],"criterios":["frase comprobable leyendo el cambio"]}
Como mucho ${criterios.MAX_CRITERIOS_PLAN} criterios. Que se puedan comprobar leyendo el código (por ejemplo «el código postal se valida con la misma expresión que direccion.js»), no deseos vagos.`;

const lista = (x, n, largo) => (Array.isArray(x) ? x : []).map((s) => String(s || '').trim().slice(0, largo)).filter(Boolean).slice(0, n);

function prompt(t) {
  return [
    `COMPROBACIÓN: npm run ${t.suite}`, `CASO QUE FALLA: ${t.caso}`,
    t.causa ? `CAUSA: ${t.causa}` : 'CAUSA: sin determinar',
    t.archivo ? `DÓNDE: ${t.archivo}${t.lineas?.length ? `, líneas ${t.lineas.join(', ')}` : ''}` : '',
    t.evidencia ? `EVIDENCIA: ${t.evidencia}` : '',
    `ARCHIVOS EDITABLES: ${t.editables.join(', ') || 'ninguno'}`,
  ].filter(Boolean).join('\n');
}

/**
 * Hace (o reutiliza) el plan, monta el mapa de criterios y escribe 02-PLAN.md.
 * Devuelve {objetivo, pasos, riesgos, mapa}, o null si hay que parar.
 */
async function planifica(ctx, caso, t, e, verdes) {
  if (!e.plan || e.plan.huella !== t.huella) {
    const texto = await preguntaOllama(ctx, SISTEMA, prompt(t));
    if (texto == null && debeParar(ctx)) return null;
    const j = (texto && extraeJSON(texto)) || {};
    e.plan = {
      huella: t.huella,
      objetivo: String(j.objetivo || `Que deje de fallar: ${caso.texto}`).slice(0, 300),
      pasos: lista(j.pasos, 6, 300), riesgos: lista(j.riesgos, 4, 300), criterios: lista(j.criterios, criterios.MAX_CRITERIOS_PLAN, 200),
    };
  }
  const mapa = criterios.delPlan(criterios.base(caso, verdes, ctx.aplicar), e.plan.criterios);
  if (!ctx.aplicar) criterios.marca(mapa, 'CA-6', 'no aplica', 'ensayo: no se publica en el proyecto');
  const plan = { ...e.plan, mapa };
  escribePlan(ctx, caso, t, plan);
  return plan;
}

/** 02-PLAN.md. Se reescribe al final con el resultado de cada criterio. */
function escribePlan(ctx, caso, t, plan) {
  tiquets.escribe(ctx, caso, 2, [
    `# Plan · \`${caso.suite}\` · ${caso.clave}`, '',
    `**Objetivo:** ${plan.objetivo}`, '',
    ...(t.causa ? [`**Parte de:** ${t.causa}`, ''] : []),
    '## Pasos', '', ...(plan.pasos.length ? plan.pasos.map((p, i) => `${i + 1}. ${p}`) : ['1. Cambio mínimo en el archivo señalado por el tiquet.']),
    '', '## Riesgos', '', ...(plan.riesgos.length ? plan.riesgos.map((r) => `- ${r}`) : ['- Ninguno señalado.']),
    '', '## Mapa de criterios de aceptación', '',
    'Terminado significa **todos en ✅ o ➖**. CA-1 a CA-6 los comprueba una máquina; los siguientes, la revisión de código.', '',
    criterios.tabla(plan.mapa),
  ]);
}

module.exports = { planifica, escribePlan, SISTEMA };
