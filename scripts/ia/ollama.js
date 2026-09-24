// IA reparadora — conversación con el Ollama del equipo.
//
// Autonomía: si Ollama no está (el equipo arrancó y aún no lo ha abierto, o se
// ha caído a media noche), NO se para: espera, reintenta con esperas cada vez
// más largas hasta 5 minutos, y sigue donde estaba cuando vuelve. Lo único que
// para en seco es que falte el modelo, porque eso no se arregla esperando.
'use strict';

const { registra, espera, debeParar } = require('./bitacora');

function esLocal(url) {
  try { return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(url).hostname); } catch { return false; }
}

function sinConexion(error) {
  const codigo = error?.cause?.code || error?.code;
  return ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'UND_ERR_SOCKET'].includes(codigo) || /fetch failed/i.test(String(error?.message));
}

async function modelos(ctx) {
  const r = await fetch(`${ctx.ollama}/api/tags`, { signal: AbortSignal.timeout(10000) });
  const datos = await r.json();
  return (datos.models || []).map((m) => String(m.name || m.model));
}

/**
 * Espera a que Ollama responda. Devuelve true cuando está, false si se acabó
 * el tiempo o hay que parar. Lanza error solo si Ollama está pero el modelo no.
 */
async function esperaOllama(ctx) {
  let pausa = ctx.esperaOllamaMs;
  let avisado = false;
  while (!debeParar(ctx)) {
    let lista = null;
    try { lista = await modelos(ctx); } catch { /* no está */ }
    if (lista) {
      if (!lista.some((m) => m === ctx.modelo || m === `${ctx.modelo}:latest`)) {
        throw new Error(`El modelo «${ctx.modelo}» no está descargado. Ejecuta: ollama pull ${ctx.modelo}\nDisponibles: ${lista.join(', ') || 'ninguno'}`);
      }
      if (avisado) registra(ctx, 'Ollama vuelve a responder; se sigue.');
      ctx.estado.esperandoOllama = null;
      return true;
    }
    if (!avisado) {
      registra(ctx, `Ollama no responde en ${ctx.ollama}; se espera a que vuelva.`);
      ctx.estado.esperandoOllama = new Date().toISOString();
      avisado = true;
    }
    ctx.estado.minutosEsperandoOllama = (ctx.estado.minutosEsperandoOllama || 0) + pausa / 60000;
    await espera(ctx, pausa);
    pausa = Math.min(pausa * 2, ctx.esperaOllamaMaxMs);
  }
  return false;
}

/** Devuelve el texto de la respuesta, o null si se acabó el tiempo o no hubo manera. */
async function preguntaOllama(ctx, sistema, usuario) {
  for (let intento = 0; intento < 3;) {
    if (debeParar(ctx)) return null;
    try {
      const respuesta = await fetch(`${ctx.ollama}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: ctx.modelo,
          stream: false,
          format: 'json',
          messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
          options: { temperature: 0.15 + 0.2 * intento, num_ctx: ctx.numCtx },
        }),
        signal: AbortSignal.timeout(ctx.tiempoOllamaMs),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(`Ollama ${respuesta.status}: ${datos.error || 'error'}`);
      const texto = String(datos?.message?.content || '').trim();
      if (!texto) throw new Error('Ollama devolvió una respuesta vacía');
      ctx.estado.llamadas++;
      return texto;
    } catch (error) {
      // Caído no gasta intento: se espera a que vuelva y se repite la pregunta.
      if (sinConexion(error)) { if (!await esperaOllama(ctx)) return null; continue; }
      intento++;
      registra(ctx, `  Ollama no respondió bien (${String(error.message || error).slice(0, 160)}); reintento ${intento}/3`);
      await espera(ctx, Math.min(15000, ctx.esperaOllamaMs) * intento);
    }
  }
  return null;
}

module.exports = { esLocal, esperaOllama, preguntaOllama };
