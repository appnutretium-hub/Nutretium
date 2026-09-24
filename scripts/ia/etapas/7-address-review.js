// Etapa 7 — ADDRESS-REVIEW: atender las sugerencias de la revisión.
//
// Lo que la revisión de código (4) dejó como sugerencia no bloqueó el release.
// Aquí se atiende, UNA vez, como un parche aparte que depende del principal:
// la implementación recibe las sugerencias como encargo, el cambio pasa por el
// guardián, por sinTrampas y por QA contra la pasada ya reparada (el caso
// tiene que seguir arreglado y nada puede romperse). Si vale, se publica como
// su propio parche; si no, las sugerencias quedan escritas para una persona.
// Nunca pone en riesgo el arreglo principal: si algo falla, se deshace solo lo
// suyo.
'use strict';

const { registra, debeParar } = require('../bitacora');
const { deshace, describe } = require('../cambios');
const implementacion = require('./3-implementa');
const { sinTrampas } = require('./4-revision');
const { qa } = require('./5-qa');
const { publica } = require('./6-release');
const correcciones = require('../correcciones');
const tiquets = require('../tiquets');

const encargo = (sugerencias) => `ENCARGO: el caso YA está arreglado. Atiende estas sugerencias de la revisión de código sin cambiar el comportamiento ni romper nada. Si alguna no merece la pena o no es segura, no la hagas; si ninguna, deja "cambios" vacío.\n${sugerencias.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

function documenta(ctx, caso, sugerencias, lineas) {
  tiquets.escribe(ctx, caso, 7, [
    `# Address-review · \`${caso.suite}\` · ${caso.clave}`, '',
    '## Sugerencias de la revisión', '', ...(sugerencias.length ? sugerencias.map((s) => `- ${s}`) : ['Ninguna: la revisión no pidió nada más.']),
    '', '## Qué se hizo', '', ...lineas,
  ]);
}

/**
 * Atiende las sugerencias. El espacio tiene que tener aplicado el parche
 * principal. Devuelve {parche, aplicado} si se publicó un parche de
 * seguimiento, o null. Deja el espacio con el seguimiento aplicado si vale.
 */
async function atiende(ctx, { r, caso, archivos, t, plan, revision, principal, qaPrincipal, verdes, e }) {
  const sugerencias = revision?.sugerencias || [];
  if (!sugerencias.length) { documenta(ctx, caso, [], ['Nada que atender.']); return null; }
  if (e.seguimiento) { documenta(ctx, caso, sugerencias, [`Ya atendidas en el parche ${e.seguimiento}.`]); return null; }
  if (debeParar(ctx)) { documenta(ctx, caso, sugerencias, ['Sin tiempo: quedan para una persona.']); return null; }

  const propuesta = await implementacion.propone(ctx, r, caso, archivos, t, plan, [], encargo(sugerencias));
  const no = (motivo) => {
    registra(ctx, `  address-review: no se aplica — ${motivo.slice(0, 200)}`);
    documenta(ctx, caso, sugerencias, [`No se ha aplicado ningún cambio: ${motivo}`, '', 'Quedan como pistas para una persona; el arreglo principal sigue en pie.']);
    correcciones.marca(ctx, caso, correcciones.entrada(ctx, caso).estado, { sugerencias });
    return null;
  };
  if (propuesta == null) return no('la IA no respondió');
  if (propuesta.invalido) return no('la respuesta no era JSON válido');
  if (!propuesta.cambios?.length) return no(`la implementación no ve nada que cambiar${propuesta.diagnostico ? ` (${String(propuesta.diagnostico).slice(0, 200)})` : ''}`);

  const aplicado = implementacion.aplica(ctx, propuesta);
  if (aplicado.error) return no(aplicado.error);
  const trampa = sinTrampas(aplicado.cambios);
  if (trampa) { deshace(ctx, aplicado.archivos); return no(trampa); }
  const prueba = await qa(ctx, caso, qaPrincipal.repetida, verdes);
  if (!prueba.ok) { deshace(ctx, aplicado.archivos); return no(`no pasa QA: ${prueba.motivo}`); }

  const pub = await publica(ctx, caso, t, null, { diagnostico: `Atiende la revisión de ${principal.id}: ${propuesta.diagnostico || sugerencias.join('; ')}`, aplicado }, null, { depende: principal.id, marcaRegistro: false });
  if (pub.resultado === 'fallido') { deshace(ctx, aplicado.archivos); return no(pub.nota || 'no se pudo publicar'); }
  correcciones.marca(ctx, caso, correcciones.entrada(ctx, caso).estado, { seguimiento: pub.parche.id, sugerencias });
  documenta(ctx, caso, sugerencias, [
    `Atendidas en el parche **${pub.parche.id}**, que depende del ${principal.id}: ${describe(aplicado.cambios)}`, '',
    `- pasa QA: ${prueba.suites.map((s) => `\`${s.nombre}\``).join(', ')}`,
    `- probarlo: \`${pub.parche.probar}\``,
    ...(pub.resultado === 'aplicado' ? [`- deshacerlo (solo esto, el arreglo principal se queda): \`npm run ia:reparar -- --revertir ${pub.parche.id} --aplicar\``] : []),
    '', ...tiquets.cambiosMd(aplicado.cambios),
  ]);
  return { parche: pub.parche, aplicado };
}

module.exports = { atiende };
