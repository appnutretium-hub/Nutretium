// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — pruebas de la IA reparadora
//
//   npm run test:ia
//
// No hace falta Ollama: se levanta uno falso en 127.0.0.1 que contesta lo que
// le decimos, y se trabaja sobre un proyecto de juguete en una carpeta
// temporal. Lo que se comprueba no es que la IA acierte —eso no depende de
// nosotros— sino que NO se cuele nada que no haya verificado una prueba, y
// que cada error recorra sus siete etapas (tiquet, plan con criterios,
// implementación, revisión, QA, release, address-review) una sola vez.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const ia = require('./ia-reparador.js');

let correctas = 0;
let fallidas = 0;

function comprueba(descripcion, condicion, detalle) {
  if (condicion) {
    correctas++;
    console.log(`  OK  ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  FALLA  ${descripcion}${detalle ? `\n         ${detalle}` : ''}`);
  }
}

// ── Qué puede tocar la IA ────────────────────────────────────────────────────

console.log('\nLímites de lo que puede cambiar la IA');

const raizFalsa = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-limites-'));
const cambio = (archivo, buscar = 'a', reemplazar = 'b') => ia.revisaCambio({ archivo, buscar, reemplazar }, raizFalsa, 'a');

comprueba('acepta un cambio normal en netlify/lib', cambio('netlify/lib/envio.js') === null);
comprueba('rechaza tocar una prueba (scripts/test-*.js)', /prueba/.test(cambio('scripts/test-precios.js')));
comprueba('rechaza tocar una prueba (tests/*.spec.js)', /prueba/.test(cambio('tests/e2e-storefront.spec.js')));
comprueba('rechaza products-data.js', /products-data/.test(cambio('products-data.js')));
comprueba('rechaza netlify.toml', /netlify\.toml/.test(cambio('netlify.toml')));
comprueba('rechaza package.json', /dependencias/.test(cambio('package.json')));
comprueba('rechaza .env', cambio('.env.local') !== null);
comprueba('rechaza salirse del proyecto con ..', /relativa/.test(cambio('../fuera.js')));
comprueba('rechaza rutas absolutas', /relativa/.test(cambio('/etc/passwd.js')));
comprueba('rechaza editarse a sí misma', /sí misma/.test(cambio('scripts/ia-reparador.js')) && /sí misma/.test(cambio('scripts/ia/flujo.js')));
comprueba('rechaza crear archivos nuevos', /no existe/.test(ia.revisaCambio({ archivo: 'nuevo.js', buscar: 'a', reemplazar: 'b' }, raizFalsa, null)));
comprueba('rechaza un «buscar» que aparece dos veces', /2 veces/.test(ia.revisaCambio({ archivo: 'a.js', buscar: 'x', reemplazar: 'y' }, raizFalsa, 'x x')));
comprueba('rechaza un «buscar» que no aparece', /no aparece/.test(ia.revisaCambio({ archivo: 'a.js', buscar: 'z', reemplazar: 'y' }, raizFalsa, 'x')));

const conControl = "if (!process.env.JWT_SECRET) return { statusCode: 503 };";
comprueba('rechaza quitar una comprobación de seguridad',
  /seguridad/.test(ia.revisaCambio({ archivo: 'auth.js', buscar: conControl, reemplazar: '' }, raizFalsa, conControl)));
comprueba('rechaza inventar un secreto por defecto',
  /secreto/.test(ia.revisaCambio({ archivo: 'auth.js', buscar: 'x', reemplazar: "const s = process.env.JWT_SECRET || 'cambiame-por-favor';" }, raizFalsa, 'x')));
comprueba('rechaza introducir eval',
  /eval/.test(ia.revisaCambio({ archivo: 'a.js', buscar: 'x', reemplazar: 'eval(y)' }, raizFalsa, 'x')));

console.log('\nPiezas sueltas');

comprueba('saca JSON aunque venga envuelto en ```json', ia.extraeJSON('```json\n{"a":1}\n```')?.a === 1);
comprueba('saca JSON aunque venga con <think> delante', ia.extraeJSON('<think>hmm</think>{"a":2}')?.a === 2);
comprueba('devuelve null si no hay JSON', ia.extraeJSON('nada') === null);
comprueba('el entorno de las pruebas no lleva secretos',
  (() => { const e = ia.entornoLimpio({ PATH: '/bin', JWT_SECRET: 'x', REDSYS_SECRET_KEY: 'y', GITHUB_TOKEN: 'z' }); return e.PATH === '/bin' && !('JWT_SECRET' in e) && !('REDSYS_SECRET_KEY' in e) && !('GITHUB_TOKEN' in e); })());
comprueba('solo acepta Ollama local', ia.esLocal('http://127.0.0.1:11434') && ia.esLocal('http://localhost:11434') && !ia.esLocal('https://ollama.ejemplo.com'));
comprueba('detecta un error de sintaxis', ia.sintaxisValida('const = 1;') !== null && ia.sintaxisValida('const a = 1;') === null);
comprueba('encuentra la línea clave del fallo', ia.lineaDelFallo('✓ uno\n✗ dos falla\n  at x') === '✗ dos falla');
comprueba('las opciones se leen bien',
  (() => { const o = ia.leeArgumentos(['--horas', '10', '--aplicar', '--solo', 'test,test:redsys']); return o.horas === 10 && o.aplicar && o.comprobaciones.join() === 'test,test:redsys'; })());
comprueba('--probar 7 y --revertir 12 se leen como parches 0007 y 0012',
  ia.leeArgumentos(['--probar', '7']).parche === '0007' && ia.leeArgumentos(['--revertir', '12']).parche === '0012' && ia.leeArgumentos(['--probar']).parche === undefined);
comprueba('--revertir sin número es un error', (() => { try { ia.leeArgumentos(['--revertir']); return false; } catch { return true; } })());
comprueba('segundo plano, detalle, estado y parar se leen',
  (() => { const o = ia.leeArgumentos(['--segundo-plano', '--detalle']); return o.segundoPlano && o.detalle && ia.leeArgumentos(['--estado']).orden === 'estado' && ia.leeArgumentos(['--parar']).orden === 'parar'; })());

console.log('\nRevisión de código mecánica y criterios de aceptación');

const trampa = (buscar, reemplazar) => ia.sinTrampas([{ archivo: 'a.js', buscar, reemplazar }]);
comprueba('sinTrampas: pilla un catch vacío', /catch vacío/.test(trampa('f();', 'try { f(); } catch {}')));
comprueba('sinTrampas: pilla la lógica cambiada por un valor fijo', /valor fijo/.test(trampa('return a - b;', 'return 5;')));
comprueba('sinTrampas: pilla una comprobación borrada', /comprobación/.test(trampa('if (!x) throw new Error("no");', '')));
comprueba('sinTrampas: deja pasar un arreglo normal', trampa('a - b', 'a + b') === null);
comprueba('la misma propuesta da la misma huella', ia.huellaPlan({ cambios: [{ archivo: './a.js', buscar: 'x', reemplazar: 'y' }] }) === ia.huellaPlan({ cambios: [{ archivo: 'a.js', buscar: 'x', reemplazar: 'y' }] }));
{
  const C = ia.criterios;
  const caso = { suite: 'test', texto: 'falla algo', clave: 'abc' };
  const mapa = C.delPlan(C.base(caso, ['test', 'test:cero'], false), ['uno', 'dos', 'tres', 'cuatro']);
  comprueba('el mapa lleva CA-1..CA-6 fijos y como mucho 3 del plan', mapa.length === 9 && mapa[0].id === 'CA-1' && mapa[8].id === 'CA-9');
  comprueba('un mapa con pendientes no está terminado', !C.terminado(mapa));
  for (const c of mapa) C.marca(mapa, c.id, c.id === 'CA-6' ? 'no aplica' : 'cumple');
  comprueba('todo en cumple o no aplica = terminado', C.terminado(mapa));
  comprueba('la tabla del plan es markdown con resultado', /\| CA-1 \|/.test(C.tabla(mapa)) && /✅ cumple/.test(C.tabla(mapa)));
}


// ── De principio a fin, con un Ollama falso ──────────────────────────────────

const escribe = (raiz, rel, texto) => { fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true }); fs.writeFileSync(path.join(raiz, rel), texto); };
const lee = (raiz, rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const SUMA_MAL = "'use strict';\nmodule.exports = (a, b) => a - b;\n";

function proyectoDeJuguete() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-proyecto-'));
  escribe(raiz, 'package.json', JSON.stringify({
    name: 'juguete', private: true,
    scripts: { test: 'node scripts/test-suma.js', 'test:cero': 'node scripts/test-cero.js' },
  }));
  // El error sembrado: resta en vez de sumar.
  escribe(raiz, 'lib/suma.js', SUMA_MAL);
  escribe(raiz, 'scripts/test-suma.js',
    "const assert = require('assert');\nconst suma = require('../lib/' + 'suma');\nassert.strictEqual(suma(2, 3), 5, 'lib/suma.js: 2 + 3 tiene que dar 5');\nconsole.log('ok suma');\n");
  escribe(raiz, 'scripts/test-cero.js',
    "const assert = require('assert');\nconst suma = require('../lib/' + 'suma');\nassert.strictEqual(suma(0, 0), 0, 'lib/suma.js: 0 + 0 tiene que dar 0');\nconsole.log('ok cero');\n");
  return raiz;
}

/**
 * Ollama falso que contesta según QUÉ etapa pregunta (lo dice el mensaje de
 * sistema). `guion` lleva una cola por etapa; lo que no está en el guion se
 * contesta con algo razonable. `caidoAlPrincipio` = cuántas veces no responde
 * antes de levantarse.
 */
function ollamaFalso(guion = {}, { caidoAlPrincipio = 0 } = {}) {
  const recibidas = [];
  const por = (rol) => recibidas.filter((p) => p.rol === rol);
  let caido = caidoAlPrincipio;
  const toca = (cola, peticion, porDefecto) => {
    const x = (guion[cola] || []).shift();
    return typeof x === 'function' ? x(peticion) : (x || porDefecto);
  };
  const servidor = http.createServer((req, res) => {
    if (caido > 0) { caido--; req.socket.destroy(); return; }
    let cuerpo = '';
    req.on('data', (b) => { cuerpo += b; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'falso:1b' }] }));
      const peticion = JSON.parse(cuerpo || '{}');
      const sistema = peticion.messages?.[0]?.content || '';
      const usuario = peticion.messages?.[1]?.content || '';
      let rol; let contenido;
      if (/ANALISTA/.test(sistema)) { rol = 'tiquet'; contenido = toca('tiquet', usuario, { causa: 'resta en vez de sumar', archivo: 'lib/suma.js', lineas: [2], evidencia: 'a - b', confianza: 'alta' }); }
      else if (/PLANIFICADOR/.test(sistema)) { rol = 'plan'; contenido = toca('plan', usuario, { objetivo: 'que la suma sume', pasos: ['cambiar el operador'], riesgos: ['ninguno'], criterios: ['la función usa el operador +'] }); }
      else if (/IMPLEMENTADOR/.test(sistema) && /ENCARGO:/.test(usuario)) { rol = 'address-review'; contenido = toca('addressReview', usuario, { diagnostico: 'nada que cambiar', cambios: [] }); }
      else if (/IMPLEMENTADOR/.test(sistema)) { rol = 'implementacion'; contenido = toca('implementacion', usuario, { diagnostico: 'no sé', cambios: [] }); }
      else if (/REVISOR DE CÓDIGO/.test(sistema)) { rol = 'revision'; contenido = toca('revision', usuario, { aprobado: true, motivo: 'correcto', bloqueantes: [], sugerencias: [], criterios: { 'CA-7': true }, comoProbar: 'suma 2 y 3' }); }
      else { rol = 'revisor-archivos'; contenido = { hallazgos: [{ linea: 2, gravedad: 'baja', problema: 'ejemplo de hallazgo', propuesta: 'ninguna' }] }; }
      recibidas.push({ rol, usuario });
      res.end(JSON.stringify({ model: 'falso:1b', message: { role: 'assistant', content: JSON.stringify(contenido) } }));
    });
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok({ servidor, recibidas, por, url: `http://127.0.0.1:${servidor.address().port}` })));
}

const cambioSuma = (reemplazar, diagnostico = 'arreglo') => ({ diagnostico, cambios: [{ archivo: 'lib/suma.js', buscar: 'a - b', reemplazar }] });

async function corre(raiz, guion, opciones = {}, ollama = {}) {
  const falso = await ollamaFalso(guion, ollama);
  try {
    const ctx = await ia.ejecuta({
      raiz, ollama: falso.url, modelo: 'falso:1b', silencioso: true, comprobaciones: ['test', 'test:cero'],
      maxCiclos: 1, revision: false, finMs: Date.now() + 180000, intentosPorRonda: 6, intentosMaximos: 6,
      esperaOllamaMs: 20, esperaOllamaMaxMs: 40, ...opciones,
    });
    return { ctx, falso };
  } finally {
    falso.servidor.close();
  }
}

const parche = (raiz, id) => {
  const dir = path.join(raiz, '.ia-reparador', 'parches');
  const f = fs.readdirSync(dir).find((n) => n.startsWith(`${id}-`) && n.endsWith('.json'));
  return f ? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) : null;
};
const carpetaTiquet = (raiz) => {
  const dir = path.join(raiz, '.ia-reparador', 'tiquets');
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((n) => path.join(dir, n)) : [];
};

(async () => {
  try {
    await ia.ejecuta({ raiz: raizFalsa, ollama: 'https://ollama.ejemplo.com' });
    comprueba('ejecuta() rechaza un Ollama remoto', false);
  } catch (e) {
    comprueba('ejecuta() rechaza un Ollama remoto', /este equipo/.test(e.message), e.message);
  }

  // Seis intentos, cada uno cae en una etapa distinta, y el sexto es el bueno.
  const guionCompleto = () => ({
    implementacion: [
      { diagnostico: 'la prueba está mal', cambios: [{ archivo: 'scripts/test-suma.js', buscar: '5,', reemplazar: '-1,' }] }, // 3 · guardián
      cambioSuma('5', 'devuelve siempre 5'),                // 4 · sinTrampas, sin gastar consulta
      cambioSuma('b + a - 0 * a', 'rodeo'),                 // 4 · la revisión lo veta
      cambioSuma('(a || 1) + b', 'suma con un apaño'),      // 5 · QA: rompe test:cero
      cambioSuma('(a || 1) + b', 'suma con un apaño'),      //     repetida: ni se prueba
      cambioSuma('a + b', 'resta en vez de sumar'),         // el bueno
    ],
    revision: [
      { aprobado: false, motivo: 'da rodeos', bloqueantes: ['el rodeo esconde la operación'], sugerencias: [] },
      { aprobado: true, motivo: 'parece bien', bloqueantes: [], sugerencias: [] },
      { aprobado: true, motivo: 'correcto', bloqueantes: [], sugerencias: ['añade un comentario que diga qué hace'], criterios: { 'CA-7': true }, comoProbar: 'suma(2, 3) da 5' },
    ],
    addressReview: [{ diagnostico: 'comentario', cambios: [{ archivo: 'lib/suma.js', buscar: "'use strict';", reemplazar: "'use strict';\n// Suma dos números." }] }],
  });

  console.log('\nLas siete etapas, en ensayo');
  const raiz = proyectoDeJuguete();
  {
    const { ctx, falso } = await corre(raiz, guionCompleto());
    const por = (rol) => falso.por(rol);
    comprueba('1 · el tiquet se enriquece una sola vez', por('tiquet').length === 1, `veces: ${por('tiquet').length}`);
    comprueba('2 · el plan se hace una sola vez', por('plan').length === 1);
    comprueba('3 · la implementación se consulta 6 veces (una por intento)', por('implementacion').length === 6, `veces: ${por('implementacion').length}`);
    comprueba('4 · la revisión solo gasta consulta en lo que pasa el guardián y sinTrampas (3)', por('revision').length === 3, `veces: ${por('revision').length}`);
    const primera = por('implementacion')[0].usuario;
    comprueba('la implementación recibe el tiquet, el plan y el mapa de criterios', /TIQUET: resta en vez de sumar/.test(primera) && /PLAN: que la suma sume/.test(primera) && /CA-7: la función usa el operador \+/.test(primera));
    const ultima = por('implementacion')[5].usuario;
    comprueba('al reintentar sabe qué rompió QA y qué vetó la revisión', /rompió test:cero/.test(ultima) && /revisión pide cambios/.test(ultima) && /propusiste exactamente lo mismo/.test(ultima));

    const rep = ctx.estado.reparaciones;
    comprueba('6 · release: dos parches, el principal y el de address-review', rep.length === 2 && rep[0].cambios[0].reemplazar === 'a + b' && rep[1].depende === rep[0].parche, JSON.stringify(rep.map((x) => [x.parche, x.depende])));
    comprueba('7 · address-review recibe las sugerencias de la revisión', /añade un comentario/.test(por('address-review')[0]?.usuario || ''));
    comprueba('en ensayo NO toca el proyecto', lee(raiz, 'lib/suma.js') === SUMA_MAL);
    comprueba('el espacio aparte vuelve a ser copia del proyecto', lee(path.join(raiz, 'node_modules', '.cache', 'ia-reparador', 'espacio'), 'lib/suma.js') === SUMA_MAL);
    comprueba('la prueba sigue intacta', /5, 'lib\/suma/.test(lee(raiz, 'scripts/test-suma.js')));

    const [tq] = carpetaTiquet(raiz);
    const docs = tq ? fs.readdirSync(tq).sort() : [];
    comprueba('el tiquet deja un documento por etapa (01 a 07)', docs.join() === '01-TIQUET.md,02-PLAN.md,03-IMPLEMENTACION.md,04-REVISION.md,05-QA.md,06-RELEASE.md,07-ADDRESS-REVIEW.md', docs.join());
    const planMd = tq ? fs.readFileSync(path.join(tq, '02-PLAN.md'), 'utf8') : '';
    comprueba('02-PLAN.md lleva el mapa de criterios con su resultado', /Mapa de criterios de aceptación/.test(planMd) && /\| CA-1 \|.*✅ cumple/.test(planMd) && /\| CA-7 \|.*✅ cumple/.test(planMd) && /\| CA-6 \|.*➖ no aplica/.test(planMd), planMd);
    comprueba('01-TIQUET.md lleva la causa enriquecida', /\*\*Causa:\*\* resta en vez de sumar/.test(fs.readFileSync(path.join(tq, '01-TIQUET.md'), 'utf8')));
    comprueba('03 y 04 cuentan cada intento y por qué no valió', /3 · implementación/.test(fs.readFileSync(path.join(tq, '03-IMPLEMENTACION.md'), 'utf8')) && /cambios pedidos/.test(fs.readFileSync(path.join(tq, '04-REVISION.md'), 'utf8')));
    comprueba('06-RELEASE.md dice cómo probarlo en un paso', /npm run ia:probar -- 0001/.test(fs.readFileSync(path.join(tq, '06-RELEASE.md'), 'utf8')));
    comprueba('el parche guarda el mapa de criterios terminado', ia.criterios.terminado(parche(raiz, '0001').criterios || [{ estado: 'pendiente' }]));
    const informe = lee(raiz, '.ia-reparador/INFORME.md');
    comprueba('el informe enseña la propuesta y su tiquet', /propuesta \(ensayo\)/.test(informe) && /a \+ b/.test(informe) && /\.ia-reparador\/tiquets\//.test(informe));
    comprueba('no deja el cerrojo puesto', !fs.existsSync(path.join(raiz, '.ia-reparador', 'en-marcha.lock')));

    const p1 = await ia.probar({ raiz, parche: '0001' });
    comprueba('ia:probar 0001 prueba la propuesta sin tocar el proyecto', p1.ok && p1.casoArreglado === true && lee(raiz, 'lib/suma.js') === SUMA_MAL, p1.motivo);
    const p2 = await ia.probar({ raiz, parche: '0002' });
    comprueba('ia:probar 0002 aplica antes el parche del que depende', p2.ok && p2.casoArreglado === true, p2.motivo);
  }

  console.log('\nCorrección única: ensayo → aplicar sin volver a preguntar');
  {
    const { ctx, falso } = await corre(raiz, {}, { aplicar: true });
    comprueba('no consulta a la IA: reutiliza los parches ya verificados', falso.recibidas.length === 0, falso.recibidas.map((x) => x.rol).join());
    comprueba('guarda en el proyecto el arreglo y el de address-review', /a \+ b/.test(lee(raiz, 'lib/suma.js')) && /Suma dos números/.test(lee(raiz, 'lib/suma.js')), lee(raiz, 'lib/suma.js'));
    comprueba('los dos parches quedan como aplicados', parche(raiz, '0001').estado === 'aplicado' && parche(raiz, '0002').estado === 'aplicado');
    comprueba('no crea parches nuevos para el mismo error', !parche(raiz, '0003'));
    comprueba('CA-6: comprobado en el proyecto tras publicar', parche(raiz, '0001').criterios.find((c) => c.id === 'CA-6').estado === 'cumple');
    const copias = path.join(raiz, '.ia-reparador', 'copias');
    const bak = fs.readdirSync(copias).map((d) => path.join(copias, d, 'lib', 'suma.js.bak')).find((f) => fs.existsSync(f));
    comprueba('guarda la versión anterior en .ia-reparador/copias', Boolean(bak) && fs.readFileSync(bak, 'utf8') === SUMA_MAL);
    comprueba('marca la reparación como aplicada', ctx.estado.reparaciones.some((x) => x.aplicada && x.reutilizada));
  }

  console.log('\nDeshacer un parche');
  {
    const antes = lee(raiz, 'lib/suma.js');
    const ensayo = ia.revertir({ raiz, parche: '0002' });
    comprueba('--revertir sin --aplicar solo enseña qué haría', ensayo.ok && ensayo.ensayo && lee(raiz, 'lib/suma.js') === antes);
    comprueba('no deja deshacer el principal con su address-review encima', /deshaz primero el 0002/.test(ia.revertir({ raiz, parche: '0001', aplicar: true }).error || ''));
    const r2 = ia.revertir({ raiz, parche: '0002', aplicar: true });
    const r1 = ia.revertir({ raiz, parche: '0001', aplicar: true });
    comprueba('deshechos los dos, el archivo vuelve a estar como al principio', r2.ok && r1.ok && lee(raiz, 'lib/suma.js') === SUMA_MAL, lee(raiz, 'lib/suma.js'));
    const { falso } = await corre(raiz, guionCompleto(), { aplicar: true });
    comprueba('lo que una persona revirtió no se vuelve a arreglar', falso.recibidas.length === 0 && lee(raiz, 'lib/suma.js') === SUMA_MAL);
  }

  console.log('\nUn error que reaparece no se corrige dos veces');
  {
    const r = proyectoDeJuguete();
    await corre(r, { implementacion: [cambioSuma('a + b')] }, { aplicar: true });
    comprueba('aplicando desde cero, sin ensayo previo, también lo arregla', /a \+ b/.test(lee(r, 'lib/suma.js')));
    escribe(r, 'lib/suma.js', SUMA_MAL); // alguien lo deshace
    const { ctx, falso } = await corre(r, { implementacion: [cambioSuma('a + b')] }, { aplicar: true });
    comprueba('el error reaparecido no se vuelve a tocar ni se pregunta a la IA', falso.recibidas.length === 0 && lee(r, 'lib/suma.js') === SUMA_MAL);
    comprueba('queda como «reaparecido» para una persona', Object.values(ctx.correcciones.errores).some((e) => e.estado === 'reaparecido'));
    comprueba('el informe lo pone en «Necesitan a una persona»', /\*\*reaparecido\*\*/.test(lee(r, '.ia-reparador/INFORME.md')));
  }

  console.log('\nGranular: dos casos en una suite, dos tiquets, dos parches');
  {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-granular-'));
    escribe(r, 'package.json', JSON.stringify({ name: 'g', private: true, scripts: { test: 'node scripts/test-texto.js' } }));
    escribe(r, 'lib/texto.js', "'use strict';\nexports.mayus = (s) => s.toLowerCase();\nexports.minus = (s) => s.toUpperCase();\n");
    escribe(r, 'scripts/test-texto.js', "const t = require('../lib/' + 'texto');\nlet mal = 0;\nconst caso = (nombre, ok) => { console.log(`${ok ? '✓' : '✗'} ${nombre}`); if (!ok) mal++; };\ncaso('lib/texto.js mayus pasa a mayúsculas', t.mayus('a') === 'A');\ncaso('lib/texto.js minus pasa a minúsculas', t.minus('B') === 'b');\nprocess.exitCode = mal ? 1 : 0;\n");
    const arregla = (u) => (/arregla solo este\): .*mayus/.test(u)
      ? { diagnostico: 'mayus', cambios: [{ archivo: 'lib/texto.js', buscar: 'mayus = (s) => s.toLowerCase()', reemplazar: 'mayus = (s) => s.toUpperCase()' }] }
      : { diagnostico: 'minus', cambios: [{ archivo: 'lib/texto.js', buscar: 'minus = (s) => s.toUpperCase()', reemplazar: 'minus = (s) => s.toLowerCase()' }] });
    const { ctx } = await corre(r, { tiquet: [{ causa: 'al revés' }, { causa: 'al revés' }], implementacion: [arregla, arregla] }, { comprobaciones: ['test'] });
    const rep = ctx.estado.reparaciones;
    comprueba('un parche por caso, cada uno con un solo cambio', rep.length === 2 && rep.every((x) => x.cambios.length === 1) && rep[0].fallo !== rep[1].fallo, JSON.stringify(rep.map((x) => x.fallo)));
    comprueba('dos tiquets, uno por caso, con nombres válidos en Windows', carpetaTiquet(r).length === 2 && carpetaTiquet(r).every((d) => /^[\w-]+$/.test(path.basename(d))), carpetaTiquet(r).map((d) => path.basename(d)).join());
    comprueba('el segundo parche parte del proyecto, no del primero', parche(r, '0002').archivos['lib/texto.js'].antes === lee(r, 'lib/texto.js'));
  }

  console.log('\nAutonomía');
  {
    const r = proyectoDeJuguete();
    const original = console.log;
    const pantalla = [];
    console.log = (...x) => pantalla.push(x.join(' '));
    let res;
    try { res = await corre(r, { implementacion: [cambioSuma('a + b')] }, { silencioso: false }, { caidoAlPrincipio: 3 }); } finally { console.log = original; }
    comprueba('si Ollama no está al empezar, espera y sigue (no se cae)', res.ctx.estado.reparaciones.length === 1 && res.ctx.estado.minutosEsperandoOllama > 0);
    comprueba('trabaja callada: nada en pantalla sin --detalle', pantalla.length === 0, pantalla.join(' | '));
    comprueba('pero lo deja todo en registro.log', /Tiquet test/.test(lee(r, '.ia-reparador/registro.log')));

    const r2 = proyectoDeJuguete();
    const falso = await ollamaFalso({ implementacion: [cambioSuma('a + b')] });
    try {
      const ctx = await ia.ejecuta({ raiz: r2, ollama: falso.url, modelo: 'falso:1b', silencioso: true, comprobaciones: ['test', 'test:cero'], revision: false, finMs: Date.now() + 60000,
        alPreparar: (c) => fs.writeFileSync(path.join(c.datos, 'PARAR'), 'ya') });
      comprueba('el archivo PARAR (npm run ia:reparar -- --parar) la detiene', falso.recibidas.length === 0 && ctx.estado.reparaciones.length === 0);
    } finally { falso.servidor.close(); }
    comprueba('pideParada() deja el archivo PARAR', fs.existsSync(ia.pideParada({ raiz: r2 })));
  }

  console.log('\nRevisión de archivos con todo en verde');
  {
    const r = proyectoDeJuguete();
    escribe(r, 'lib/suma.js', "'use strict';\nmodule.exports = (a, b) => a + b;\n");
    const { ctx } = await corre(r, {}, { revision: true });
    comprueba('revisa los archivos de la aplicación', ctx.estado.revisados['lib/suma.js'] !== undefined, JSON.stringify(ctx.estado.revisados));
    comprueba('no revisa las pruebas', !Object.keys(ctx.estado.revisados).some(ia.esPrueba));
    const informe = lee(r, '.ia-reparador/INFORME.md');
    comprueba('apunta los hallazgos como «sin verificar»', /Sin verificar/.test(informe) && /ejemplo de hallazgo/.test(informe));
    comprueba('los hallazgos no se aplican', /a \+ b/.test(lee(r, 'lib/suma.js')));
  }

  console.log('\nLo que no puede fallar a media noche');
  {
    const cambios = require('./ia/cambios');
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-proyecto-'));
    const ctx = { raiz: r, datos: path.join(r, '.ia-reparador') };
    escribe(r, 'a.js', 'A');
    const archivos = new Map([['a.js', { antes: 'A', despues: 'A2' }], ['borrado.js', { antes: 'B', despues: 'B2' }]]);
    let motivo;
    try { motivo = cambios.llevaAlProyecto(ctx, archivos); } catch (e) { motivo = `LANZÓ ${e.message}`; }
    comprueba('llevar al proyecto un archivo que ya no existe no lanza y no toca nada', /no se puede leer/.test(motivo) && lee(r, 'a.js') === 'A', motivo);
    const uno = new Map([['a.js', { antes: 'A', despues: 'A2' }]]);
    comprueba('llevar y retirar deja el archivo como estaba', cambios.llevaAlProyecto(ctx, uno) === null && lee(r, 'a.js') === 'A2' && cambios.retiraDelProyecto(ctx, uno) === null && lee(r, 'a.js') === 'A');
    cambios.llevaAlProyecto(ctx, uno);
    escribe(r, 'a.js', 'A2 y algo tuyo');
    comprueba('no retira a ciegas un archivo que alguien ha tocado', /ha cambiado/.test(cambios.retiraDelProyecto(ctx, uno) || '') && lee(r, 'a.js') === 'A2 y algo tuyo');
  }
  {
    const { revisa } = require('./ia/etapas/4-revision');
    const C = ia.criterios;
    const plan = { objetivo: 'x', pasos: [], mapa: C.delPlan(C.base({ suite: 'test', texto: 'f', clave: 'k' }, [], false), ['propio']) };
    const ctx = { fin: Date.now() - 1, datos: os.tmpdir(), ollama: 'http://127.0.0.1:9', estado: { llamadas: 0 } };
    const rev = await revisa(ctx, {}, plan, { diagnostico: 'd', cambios: [{ archivo: 'a.js', buscar: 'a - b', reemplazar: 'a + b' }] });
    const estado = (id) => plan.mapa.find((c) => c.id === id).estado;
    comprueba('sin respuesta del revisor no se bloquea, pero CA-5 y los del plan quedan pendientes, no ✅', rev.aprobado && estado('CA-5') === 'pendiente' && estado('CA-7') === 'pendiente' && !C.terminado(plan.mapa), `${estado('CA-5')} ${estado('CA-7')}`);
  }
  {
    const r = proyectoDeJuguete();
    const { ctx } = await corre(r, guionCompleto(), { aplicar: true });
    const seg = ctx.estado.reparaciones.find((x) => x.depende);
    const ppal = ctx.estado.reparaciones.find((x) => !x.depende);
    const res = seg && ia.revertir({ raiz: r, parche: seg.parche, aplicar: true });
    const reg = JSON.parse(lee(r, '.ia-reparador/correcciones.json'));
    const e = Object.values(reg.errores).find((x) => x.parche === ppal?.parche);
    comprueba('deshacer el parche de address-review no marca el error como revertido', res?.ok && e?.estado === 'corregido' && !e.seguimiento, `${res?.error || ''} ${e?.estado}`);
  }

  console.log('\nModular');
  {
    const dir = path.join(__dirname, 'ia');
    const modulos = [];
    for (const sub of ['', 'etapas']) for (const n of fs.readdirSync(path.join(dir, sub)).filter((x) => x.endsWith('.js'))) modulos.push(path.join(sub, n));
    const largos = modulos.filter((m) => fs.readFileSync(path.join(dir, m), 'utf8').split('\n').length > 300);
    comprueba('ningún módulo de scripts/ia pasa de 300 líneas', !largos.length, largos.join(', '));
    const etapas = fs.readdirSync(path.join(dir, 'etapas')).sort();
    comprueba('una etapa, un archivo: las siete, en orden', etapas.join() === '1-tiquet.js,2-plan.js,3-implementa.js,4-revision.js,5-qa.js,6-release.js,7-address-review.js', etapas.join());
  }

  console.log(`\n${correctas} correctas, ${fallidas} fallidas.`);
  process.exit(fallidas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
