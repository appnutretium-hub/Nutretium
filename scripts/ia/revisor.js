// IA reparadora — revisión archivo por archivo cuando todo está en verde. Lo
// que encuentra va al informe como «sin verificar» y NO se aplica nunca:
// ninguna prueba lo respalda.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { NO_COPIAR, MAX_REVISION_BYTES } = require('./config');
const { esEditable, extraeJSON } = require('./guardian');
const { recorre } = require('./espacio');
const { preguntaOllama } = require('./ollama');
const { registra } = require('./bitacora');

const SISTEMA = `Eres un revisor de código sénior de NUTRETIUM, una tienda online (Node.js 22, funciones de Netlify, HTML y JS sin framework). Revisa el archivo que te paso y señala SOLO errores reales que harían fallar algo: excepciones sin controlar, await olvidados, condiciones invertidas, valores null o undefined sin comprobar, validaciones de entrada que faltan, fugas de datos, comprobaciones de seguridad que se pueden saltar. Nada de estilo, nombres ni gustos. Si no hay errores claros, devuelve la lista vacía: es la respuesta correcta más a menudo de lo que parece.

Responde SOLO con JSON:
{"hallazgos":[{"linea":123,"gravedad":"alta|media|baja","problema":"qué falla y cuándo","propuesta":"cómo arreglarlo"}]}
Máximo 5 hallazgos.`;

function candidatos(ctx) {
  const lista = [];
  recorre(ctx.espacio, ctx.espacio, new Set([...NO_COPIAR, 'sources', 'scripts', 'tests', 'docs', 'src']), (rel, abs) => {
    if (!rel.endsWith('.js') || !esEditable(rel, ctx.espacio)) return;
    const bytes = fs.statSync(abs).size;
    if (bytes === 0 || bytes > MAX_REVISION_BYTES) return;
    // Primero el servidor: ahí están el cobro, las sesiones y los pedidos.
    const prioridad = rel.startsWith('netlify/lib/') ? 0 : rel.startsWith('netlify/functions/') ? 1 : 2;
    lista.push({ rel, prioridad });
  });
  return lista.sort((a, b) => a.prioridad - b.prioridad || a.rel.localeCompare(b.rel)).map((x) => x.rel);
}

const huella = (codigo) => crypto.createHash('sha256').update(codigo).digest('hex').slice(0, 16);

/** Revisa el siguiente archivo pendiente. Devuelve false si no queda ninguno. */
async function revisaSiguiente(ctx) {
  const pendiente = candidatos(ctx).find((rel) => ctx.estado.revisados[rel] !== huella(fs.readFileSync(path.join(ctx.espacio, rel))));
  if (!pendiente) return false;
  const codigo = fs.readFileSync(path.join(ctx.espacio, pendiente), 'utf8');
  registra(ctx, `Revisando ${pendiente}`);
  const numerado = codigo.split('\n').map((l, i) => `${i + 1}| ${l}`).join('\n');
  const texto = await preguntaOllama(ctx, SISTEMA, `ARCHIVO: ${pendiente}\n\`\`\`\n${numerado.slice(0, 40000)}\n\`\`\``);
  if (texto == null) return true;
  const plan = extraeJSON(texto);
  const hallazgos = (Array.isArray(plan?.hallazgos) ? plan.hallazgos : []).slice(0, 5)
    .filter((h) => h && ['alta', 'media', 'baja'].includes(h.gravedad) && String(h.problema || '').trim())
    .map((h) => ({ linea: Number.isInteger(h.linea) ? h.linea : null, gravedad: h.gravedad, problema: String(h.problema).slice(0, 500), propuesta: String(h.propuesta || '').slice(0, 500) }));
  ctx.estado.hallazgos[pendiente] = { fecha: new Date().toISOString(), hallazgos };
  ctx.estado.revisados[pendiente] = huella(codigo);
  if (hallazgos.length) registra(ctx, `  ${hallazgos.length} posible(s) error(es) apuntado(s)`);
  return true;
}

module.exports = { revisaSiguiente, candidatos };
