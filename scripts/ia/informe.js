// IA reparadora — lo que se lee al volver: .ia-reparador/INFORME.md (entero,
// se reescribe tras cada paso) y RESUMEN.txt (diez líneas, al terminar).
'use strict';

const fs = require('fs');
const path = require('path');
const estado = require('./estado');
const tiquets = require('./tiquets');

const cerca = (t) => `\`\`\`\n${String(t).replace(/```/g, "'''")}\n\`\`\``;

function cuentas(ctx) {
  const errores = Object.values(ctx.correcciones.errores);
  const por = (e) => errores.filter((x) => x.estado === e);
  return { sesion: ctx.estado.reparaciones.filter((x) => x.fecha >= ctx.inicioIso), reaparecidos: por('reaparecido'), revertidos: por('revertido'), sinResolver: por('sin-resolver') };
}

function escribe(ctx) {
  estado.guarda(ctx);
  const e = ctx.estado;
  const { sesion, reaparecidos, revertidos, sinResolver } = cuentas(ctx);
  const pasada = e.ultimaPasada || [];
  const hallazgos = Object.entries(e.hallazgos).filter(([, v]) => v.hallazgos.length);
  const orden = { alta: 0, media: 1, baja: 2 };
  const l = [];
  l.push('# Informe de la IA reparadora', '');
  l.push(`- **Modo:** ${ctx.aplicar ? 'aplicar (las reparaciones verificadas se guardan en el proyecto)' : 'ensayo (no se ha tocado el proyecto)'}`);
  l.push(`- **Modelo:** ${ctx.modelo} (Ollama local) · etapas: 1 tiquet → 2 plan → 3 implementación → 4 revisión → 5 QA → 6 release → 7 address-review`);
  l.push(`- **Empezó:** ${new Date(ctx.inicio).toLocaleString('es-ES')} · **termina:** ${new Date(ctx.fin).toLocaleString('es-ES')}`);
  l.push(`- **Actualizado:** ${new Date().toLocaleString('es-ES')} · ciclos: ${e.ciclos} · consultas a la IA: ${e.llamadas}`);
  if (e.esperandoOllama) l.push(`- **Ahora mismo:** esperando a Ollama desde ${new Date(e.esperandoOllama).toLocaleString('es-ES')}`);
  l.push('', '**Probar todo de una vez:** `npm run ia:probar`', '');

  l.push('## Última pasada de las pruebas', '');
  if (!pasada.length) l.push('Todavía no ha terminado ninguna.');
  for (const p of pasada) {
    l.push(`- ${p.ok ? '✅' : '❌'} \`${p.nombre}\``);
    for (const c of p.casos || []) l.push(`  - ${c}`);
  }
  l.push('');

  l.push(`## Reparaciones verificadas en esta sesión (${sesion.length})`, '');
  l.push('Cada una arregla UN caso que fallaba, sin romper ninguna prueba que estaba en verde, y es un parche suelto en `.ia-reparador/parches/`.', '');
  if (!sesion.length) l.push('Ninguna todavía.');
  for (const x of sesion) {
    l.push(`### Parche ${x.parche} · \`${x.comprobacion}\` — ${x.aplicada ? 'aplicada' : ctx.aplicar ? `NO aplicada: ${x.nota}` : 'propuesta (ensayo)'}`, '');
    l.push(`**Caso:** ${x.fallo}`, '');
    if (x.depende) l.push(`**Address-review:** atiende las sugerencias de la revisión del parche ${x.depende}`, '');
    if (x.tiquet) l.push(`**Tiquet:** \`${x.tiquet}/\` (léelo en orden: 01-TIQUET … 07-ADDRESS-REVIEW)${x.terminado === false ? ' · ⚠️ no cumple todos los criterios' : x.terminado ? ' · criterios de aceptación ✅' : ''}`, '');
    if (x.investigacion?.causa) l.push(`**Causa (tiquet):** ${x.investigacion.causa}`, '');
    l.push(`**Arreglo (implementación):** ${x.diagnostico || '—'}`, '');
    if (x.verificacion) l.push(`**Revisión de código:** ${x.verificacion.motivo}${x.verificacion.comoProbar ? ` — ${x.verificacion.comoProbar}` : ''}`, '');
    l.push(`**Probarlo:** \`${x.probar}\`${x.aplicada ? ` · **deshacerlo:** \`npm run ia:reparar -- --revertir ${x.parche} --aplicar\`` : ''}`, '');
    for (const c of x.cambios) l.push(`\`${c.archivo}\` — antes:`, cerca(c.buscar), 'después:', cerca(c.reemplazar), '');
  }

  l.push(`## Necesitan a una persona (${reaparecidos.length + sinResolver.length})`, '');
  l.push('Corrección única: un error ya corregido que vuelve a fallar NO se corrige otra vez a ciegas.', '');
  for (const x of reaparecidos) l.push(`- **reaparecido** \`${x.suite}\`: ${x.caso} — se corrigió con el parche ${x.parche} y ha vuelto`);
  for (const x of sinResolver) l.push(`- **sin resolver** \`${x.suite}\`: ${x.caso}${x.tiquet?.causa ? `\n  - causa según el tiquet: ${x.tiquet.causa}` : ''}\n  - último intento: ${x.motivo}\n  - tiquet: \`.ia-reparador/tiquets/${tiquets.nombre({ suite: x.suite, clave: x.clave || '' })}/\``);
  for (const x of revertidos) l.push(`- revertido a mano \`${x.suite}\`: ${x.caso} (parche ${x.parche}); no se vuelve a tocar`);
  l.push('');

  l.push(`## Posibles errores encontrados al revisar (${hallazgos.reduce((n, [, v]) => n + v.hallazgos.length, 0)})`, '');
  l.push('**Sin verificar.** Ninguna prueba los respalda, así que no se han aplicado. Un modelo local se equivoca a menudo: léelos como pistas, no como hechos.', '');
  for (const [rel, v] of hallazgos.sort()) {
    l.push(`### \`${rel}\``, '');
    for (const h of [...v.hallazgos].sort((a, b) => orden[a.gravedad] - orden[b.gravedad])) {
      l.push(`- **${h.gravedad}**${h.linea ? ` (línea ${h.linea})` : ''}: ${h.problema}${h.propuesta ? `\n  - propuesta: ${h.propuesta}` : ''}`);
    }
    l.push('');
  }
  fs.writeFileSync(path.join(ctx.datos, 'INFORME.md'), l.join('\n'));
}

/** Lo único que se enseña en pantalla: al terminar. */
function resumen(ctx) {
  const { sesion, reaparecidos, sinResolver } = cuentas(ctx);
  const pasada = ctx.estado.ultimaPasada || [];
  const l = [
    `IA reparadora — ${ctx.aplicar ? 'aplicando' : 'ensayo'} — ${new Date().toLocaleString('es-ES')}`,
    `Pruebas: ${pasada.filter((p) => p.ok).length}/${pasada.length} en verde`,
    `Reparaciones verificadas: ${sesion.length} (${sesion.filter((x) => x.aplicada).length} aplicadas)`,
  ];
  for (const x of sesion) l.push(`  ${x.parche}  ${x.comprobacion}: ${x.fallo.slice(0, 80)}  →  ${x.probar}`);
  if (reaparecidos.length + sinResolver.length) l.push(`Necesitan a una persona: ${reaparecidos.length + sinResolver.length} (ver el informe)`);
  l.push(`Informe: ${path.join(ctx.datos, 'INFORME.md')}`, 'Probar todo: npm run ia:probar');
  const texto = l.join('\n');
  try { fs.writeFileSync(path.join(ctx.datos, 'RESUMEN.txt'), `${texto}\n`); } catch { /* sin disco */ }
  return texto;
}

module.exports = { escribe, resumen };
