// Etapa 5 — QA DEL CÓDIGO. Aquí manda la máquina.
//
// Con el cambio aplicado en el espacio aparte:
//   CA-1  el caso deja de fallar
//   CA-2  su comprobación no pierde casos que pasaban (se cuentan los aciertos:
//         si la suite se para en el primer error, arreglar uno destapa el
//         siguiente, y eso no es romperlo)
//   CA-3  ninguna comprobación que estaba en verde se rompe
// Si algo no cumple, el intento no vale, se deshace y la implementación recibe
// el motivo exacto.
'use strict';

const { pasaComprobacion, comparaSuite, lineaDelFallo } = require('../comprobaciones');
const criterios = require('../criterios');
const tiquets = require('../tiquets');

/**
 * Pasa las pruebas. `referencia` es la pasada con la que se compara la suite
 * del caso (la de antes del cambio). Marca CA-1..CA-3 en el mapa si se da.
 * Devuelve {ok, motivo, repetida, suites: [{nombre, ok, ms}]}.
 */
async function qa(ctx, caso, referencia, verdes, mapa = null) {
  const marca = (id, estado, detalle) => mapa && criterios.marca(mapa, id, estado, detalle);
  const suites = [];
  const repetida = await pasaComprobacion(ctx, caso.suite);
  suites.push({ nombre: caso.suite, ok: repetida.ok, ms: repetida.ms });

  const sigue = caso.general ? !repetida.ok : repetida.casos.some((c) => c.clave === caso.clave);
  marca('CA-1', sigue ? 'no cumple' : 'cumple', sigue ? lineaDelFallo(repetida.salida).slice(0, 200) : `npm run ${caso.suite}`);
  const fallo = comparaSuite(caso, referencia, repetida);
  if (fallo) {
    if (!sigue) marca('CA-2', 'no cumple', fallo);
    return { ok: false, motivo: fallo, repetida, suites };
  }
  marca('CA-2', 'cumple', `${repetida.aciertos} correctos (antes ${referencia.aciertos})`);

  for (const nombre of verdes) {
    if (nombre === caso.suite) continue;
    const otra = await pasaComprobacion(ctx, nombre);
    suites.push({ nombre, ok: otra.ok, ms: otra.ms });
    if (!otra.ok) {
      const motivo = `arregló la prueba pero rompió ${nombre}: ${lineaDelFallo(otra.salida).slice(0, 200)}`;
      marca('CA-3', 'no cumple', motivo);
      return { ok: false, motivo, repetida, suites };
    }
  }
  marca('CA-3', 'cumple', `${suites.length - 1} comprobaciones en verde`);
  return { ok: true, motivo: null, repetida, suites };
}

/** 05-QA.md: cada intento que llegó a las pruebas, con su resultado. */
function escribe(ctx, caso, pasadas) {
  const l = [`# QA · \`${caso.suite}\` · ${caso.clave}`, '', 'Todo se prueba en el espacio aparte (`node_modules/.cache/ia-reparador/espacio`), nunca sobre el proyecto.', ''];
  pasadas.forEach((p, i) => {
    l.push(`## Intento ${p.intento ?? i + 1}${p.etiqueta ? ` · ${p.etiqueta}` : ''} — ${p.ok ? '✅ pasa' : '❌ no pasa'}`, '');
    for (const s of p.suites) l.push(`- ${s.ok ? '✅' : '❌'} \`npm run ${s.nombre}\`${s.ms ? ` (${Math.round(s.ms / 1000)} s)` : ''}`);
    if (p.motivo) l.push('', `**Motivo:** ${p.motivo}`);
    l.push('');
  });
  tiquets.escribe(ctx, caso, 5, l);
}

module.exports = { qa, escribe };
