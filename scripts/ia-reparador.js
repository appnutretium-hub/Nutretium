// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — IA reparadora: revisa y repara errores sola, durante horas
//
//   npm run ia:reparar                          ensayo de 10 horas (no toca nada)
//   npm run ia:reparar -- --aplicar             igual, pero guarda lo reparado
//   npm run ia:reparar -- --segundo-plano --aplicar    sin ventana
//   npm run ia:estado                           cómo va
//   npm run ia:probar [-- 0007]                 probarlo todo, o un parche
//
// Usa el Ollama del propio equipo (127.0.0.1:11434). El código NUNCA sale de
// la máquina: si la dirección de Ollama no es local, se niega a arrancar.
//
// Cada caso que falla es un tiquet que recorre siete etapas (scripts/ia/flujo.js):
// tiquet enriquecido → plan con mapa de criterios → implementación → revisión
// de código → QA → release → address-review. Una propuesta de la IA solo se
// publica si las pruebas la respaldan; lo demás va al informe.
//
// Este archivo es solo la línea de comandos: el trabajo está en scripts/ia/.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const orquestador = require('./ia/orquestador');
const { lanzaEnSegundoPlano } = require('./ia/segundo-plano');
const { revisaCambio, esPrueba, extraeJSON, sintaxisValida } = require('./ia/guardian');
const { entornoLimpio } = require('./ia/procesos');
const { esLocal } = require('./ia/ollama');
const { lineaDelFallo, casosFallidos, comparaSuite } = require('./ia/comprobaciones');
const { extracto } = require('./ia/contexto');
const { COMPROBACIONES } = require('./ia/config');
const { sinTrampas } = require('./ia/etapas/4-revision');
const { huellaPlan } = require('./ia/correcciones');
const criterios = require('./ia/criterios');

function leeArgumentos(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`Falta el valor de ${a}`); return v; };
    const id = () => { const v = valor(); if (!/^\d{1,4}$/.test(v)) throw new Error(`${a} espera un número de parche (p. ej. 0007), no «${v}»`); return v.padStart(4, '0'); };
    if (a === '--aplicar') o.aplicar = true;
    else if (a === '--horas') o.horas = Number(valor());
    else if (a === '--modelo') o.modelo = valor();
    else if (a === '--ollama') o.ollama = valor();
    else if (a === '--solo') o.comprobaciones = valor().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--sin-revision') o.revision = false;
    else if (a === '--reiniciar') o.reiniciar = true;
    else if (a === '--detalle') o.detalle = true;
    else if (a === '--segundo-plano') o.segundoPlano = true;
    else if (a === '--parar') o.orden = 'parar';
    else if (a === '--estado') o.orden = 'estado';
    else if (a === '--revertir') { o.orden = 'revertir'; o.parche = id(); }
    else if (a === '--probar') {
      o.orden = 'probar';
      if (/^\d{1,4}$/.test(argv[i + 1] || '')) o.parche = argv[++i].padStart(4, '0');
    } else if (a === '--ayuda' || a === '-h') o.ayuda = true;
    else if (/^\d{1,4}$/.test(a) && o.orden === 'probar' && !o.parche) o.parche = a.padStart(4, '0');
    else throw new Error(`Opción desconocida: ${a} (usa --ayuda)`);
  }
  return o;
}

const AYUDA = `IA reparadora de NUTRETIUM (Ollama local)

  npm run ia:reparar -- [opciones]

  --aplicar          guarda en el proyecto las reparaciones verificadas (sin esto, ensayo)
  --horas N          cuánto tiempo trabaja (por defecto 10)
  --segundo-plano    arranca sin ventana y sigue aunque cierres PowerShell
  --detalle          enseña cada paso en pantalla (por defecto trabaja callada)
  --modelo NOMBRE    modelo de Ollama (por defecto AI_OLLAMA_MODEL o qwen3:4b)
  --solo a,b         solo estas comprobaciones (p. ej. test,test:redsys)
  --sin-revision     no revisa archivos cuando todo está en verde
  --reiniciar        olvida lo aprendido en ejecuciones anteriores
  --ollama URL       dirección de Ollama (solo local; por defecto http://127.0.0.1:11434)

  --estado           cómo va (npm run ia:estado)
  --parar            pide a la que está en marcha que pare al terminar el paso en curso
  --probar [N]       pasa todas las pruebas; con N, primero las del parche N (npm run ia:probar -- 0007)
  --revertir N       enseña qué desharía el parche N; con --aplicar, lo deshace

Cada error es un tiquet: .ia-reparador/tiquets/<suite>-<clave>/, con un
documento por etapa (01-TIQUET … 07-ADDRESS-REVIEW).
Informe: .ia-reparador/INFORME.md`;

async function muestraPrueba(opciones) {
  const r = await orquestador.probar({
    ...opciones,
    alResultado: (x) => {
      console.log(`${x.ok ? 'OK   ' : 'FALLA'}  npm run ${x.nombre}${x.ms ? `  (${Math.round(x.ms / 1000)} s)` : ''}`);
      for (const c of x.ok ? [] : x.casos.slice(0, 8)) console.log(`         ✗ ${c.texto.slice(0, 160)}`);
    },
  });
  if (r.motivo) console.log(r.motivo);
  if (r.parche) {
    console.log(`\nParche ${r.parche.id} (${r.parche.estado}${r.parche.estado === 'aplicado' ? '' : ', probado en el espacio aparte sin tocar el proyecto'}): ${r.parche.caso}`);
    if (r.casoArreglado != null) console.log(r.casoArreglado ? '✅ el caso que arreglaba sigue arreglado' : '❌ el caso que arreglaba vuelve a fallar');
    if (r.parche.criterios) console.log(`\nCriterios de aceptación:\n${r.parche.criterios.map((c) => `  ${c.id} ${c.estado.padEnd(9)} ${c.criterio.slice(0, 110)}`).join('\n')}`);
    if (r.parche.tiquet) console.log(`\nTiquet: ${r.parche.tiquet}/`);
  }
  console.log(`\n${r.ok ? 'TODO EN VERDE' : 'HAY FALLOS'}`);
  return r.ok && r.casoArreglado !== false ? 0 : 1;
}

function muestraEstado() {
  const s = orquestador.consulta();
  console.log(s.enMarcha ? `En marcha (proceso ${s.pid})${s.esperandoOllama ? ` — esperando a Ollama desde ${new Date(s.esperandoOllama).toLocaleString('es-ES')}` : ''}` : 'No hay ninguna en marcha.');
  if (s.pasada.length) console.log(`Última pasada: ${s.pasada.filter((p) => p.ok).length}/${s.pasada.length} en verde${s.pasada.some((p) => !p.ok) ? ` — fallan: ${s.pasada.filter((p) => !p.ok).map((p) => p.nombre).join(', ')}` : ''}`);
  for (const p of s.parches) console.log(`  ${p.id}  ${p.estado.padEnd(10)} ${p.suite}: ${p.caso.slice(0, 70)}${p.depende ? ` (revisión de ${p.depende})` : ''}  →  ${p.probar}`);
  if (s.necesitanPersona.length) console.log(`Necesitan a una persona: ${s.necesitanPersona.length}`);
  console.log(`Informe: ${s.informe}`);
}

async function principal(opciones) {
  if (opciones.orden === 'estado') { muestraEstado(); return 0; }
  if (opciones.orden === 'parar') { console.log(`Parada pedida (${orquestador.pideParada()}). Se detendrá al terminar el paso en curso.`); return 0; }
  if (opciones.orden === 'probar') return muestraPrueba(opciones);
  if (opciones.orden === 'revertir') {
    const r = orquestador.revertir(opciones);
    if (r.error) { console.error(r.error); return 1; }
    console.log(`${r.ensayo ? 'Desharía' : 'Deshecho'} el parche ${r.parche.id}:\n${r.resumen.map((x) => `  ${x}`).join('\n')}`);
    if (r.ensayo) console.log(`Para hacerlo: npm run ia:reparar -- --revertir ${r.parche.id} --aplicar`);
    return 0;
  }
  if (opciones.segundoPlano) {
    const argumentos = process.argv.slice(2);
    const pid = lanzaEnSegundoPlano(orquestador.preparaContexto(opciones).datos, argumentos);
    console.log(`IA reparadora trabajando en segundo plano (proceso ${pid}). Puedes cerrar esta ventana.\n  cómo va:  npm run ia:estado\n  pararla:  npm run ia:reparar -- --parar\n  informe:  .ia-reparador/INFORME.md`);
    return 0;
  }
  let contexto = null;
  process.on('SIGINT', () => {
    if (!contexto || contexto.parar) process.exit(130);
    contexto.parar = true;
    console.log('\nParando al terminar el paso en curso (Ctrl+C otra vez para salir ya)…');
  });
  const ctx = await orquestador.ejecuta({ ...opciones, alPreparar: (c) => { contexto = c; if (!c.detalle) console.log(`IA reparadora en marcha (${c.aplicar ? 'aplicando' : 'ensayo'}, hasta ${new Date(c.fin).toLocaleString('es-ES')}). Trabaja callada; lo verás al terminar. Cómo va: npm run ia:estado`); } });
  console.log(`\n${orquestador.informe.resumen(ctx)}`);
  return 0;
}

if (require.main === module) {
  let opciones;
  try { opciones = leeArgumentos(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (opciones.ayuda) { console.log(AYUDA); process.exit(0); }
  principal(opciones).then((codigo) => process.exit(codigo)).catch((e) => { console.error(`\n${e.message}`); process.exit(1); });
}

module.exports = {
  ejecuta: orquestador.ejecuta, probar: orquestador.probar, revertir: orquestador.revertir,
  consulta: orquestador.consulta, pideParada: orquestador.pideParada,
  revisaCambio, esPrueba, extraeJSON, entornoLimpio, sintaxisValida, esLocal,
  lineaDelFallo, casosFallidos, comparaSuite, leeArgumentos, extracto, COMPROBACIONES,
  sinTrampas, huellaPlan, criterios,
};
