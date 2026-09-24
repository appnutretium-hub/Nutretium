// IA reparadora — el mapa de criterios de aceptación de un tiquet.
//
// Cada criterio dice QUÉ tiene que cumplirse, QUIÉN lo comprueba (qué etapa) y
// CÓMO. Los seis primeros son fijos y los comprueba una máquina: nadie puede
// dar por terminado un tiquet que no los cumpla. Los que añade el plan (CA-7 en
// adelante) los comprueba la revisión de código, que es quien lee el cambio.
//
// Estados: pendiente · cumple · no cumple · no aplica.
'use strict';

const MAX_CRITERIOS_PLAN = 3;

/** Los criterios fijos: los mismos para cualquier tiquet. */
function base(caso, verdes, aplicar) {
  const otras = verdes.filter((n) => n !== caso.suite);
  return [
    { id: 'CA-1', criterio: `El caso «${caso.texto.slice(0, 140)}» deja de fallar`, etapa: '5 · QA', como: `npm run ${caso.suite}` },
    { id: 'CA-2', criterio: `\`${caso.suite}\` no pierde ningún caso que ya pasaba`, etapa: '5 · QA', como: 'cuenta de casos correctos antes y después' },
    { id: 'CA-3', criterio: otras.length ? `Siguen en verde: ${otras.map((n) => `\`${n}\``).join(', ')}` : 'No había otras comprobaciones en verde que proteger', etapa: '5 · QA', como: otras.length ? 'se pasan todas en el espacio aparte' : '—' },
    { id: 'CA-4', criterio: 'El cambio respeta el guardián: no toca pruebas, precios, secretos ni configuración, y el código compila', etapa: '3 · implementación', como: 'revisaCambio() y node --check' },
    { id: 'CA-5', criterio: 'Arregla la causa, no el síntoma: sin catch vacío, sin valor fijo, sin borrar comprobaciones', etapa: '4 · revisión', como: 'sinTrampas() y la revisión de código' },
    { id: 'CA-6', criterio: 'Publicado en el proyecto, la comprobación sigue en verde allí', etapa: '6 · release', como: aplicar ? `npm run ${caso.suite} en el proyecto` : 'solo con --aplicar' },
  ].map((c) => ({ ...c, estado: 'pendiente', detalle: '' }));
}

/** Añade los criterios propios del plan: frases comprobables, como mucho tres. */
function delPlan(mapa, frases) {
  const limpias = (Array.isArray(frases) ? frases : []).map((f) => String(f || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, MAX_CRITERIOS_PLAN);
  return [...mapa.filter((c) => Number(c.id.slice(3)) <= 6), ...limpias.map((criterio, i) => ({ id: `CA-${7 + i}`, criterio, etapa: '4 · revisión', como: 'lo lee la revisión de código', estado: 'pendiente', detalle: '' }))];
}

function marca(mapa, id, estado, detalle = '') {
  const c = mapa.find((x) => x.id === id);
  if (c) Object.assign(c, { estado, detalle: String(detalle).slice(0, 300) });
}

/** Vuelve a dejar pendiente lo que depende de un intento, para el siguiente. */
function reinicia(mapa) {
  for (const c of mapa) if (c.id !== 'CA-6' || c.estado !== 'no aplica') Object.assign(c, { estado: 'pendiente', detalle: '' });
}

/** Terminado = todos cumplen o no aplican. */
const terminado = (mapa) => mapa.every((c) => c.estado === 'cumple' || c.estado === 'no aplica');
const propios = (mapa) => mapa.filter((c) => Number(c.id.slice(3)) > 6);

const ICONO = { pendiente: '⏳', cumple: '✅', 'no cumple': '❌', 'no aplica': '➖' };

function tabla(mapa) {
  const celda = (t) => String(t).replace(/\|/g, '\\|');
  return [
    '| | Criterio | Lo comprueba | Cómo | Resultado |',
    '|---|---|---|---|---|',
    ...mapa.map((c) => `| ${c.id} | ${celda(c.criterio)} | ${c.etapa} | ${celda(c.como)} | ${ICONO[c.estado] || ''} ${c.estado}${c.detalle ? ` — ${celda(c.detalle)}` : ''} |`),
  ].join('\n');
}

module.exports = { base, delPlan, marca, reinicia, terminado, propios, tabla, MAX_CRITERIOS_PLAN };
