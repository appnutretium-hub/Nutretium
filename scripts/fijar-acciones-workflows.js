'use strict';

// Fija por SHA las acciones externas de `.github/workflows/`, que es lo que
// exige `scripts/audit-workflow-pinning.js`. Los SHA se leen de ahí: una sola
// lista, igual que hay un solo validador del catálogo.
//
// Existe porque el agente de Netlify NO puede subir archivos de
// `.github/workflows/`: su app de GitHub no tiene el permiso «workflows» y el
// intento hace fallar el envío entero, arrastrando cambios que no tienen nada
// que ver. Así que este archivo lo aplicas tú y lo empujas con tus
// credenciales, que sí pueden.
//
// En ensayo no escribe nada; con `--aplicar` guarda.

const fs = require('fs');
const path = require('path');
const { SHA_ESPERADOS } = require('./audit-workflow-pinning.js');

const aplicar = process.argv.includes('--aplicar');
const directorio = path.join(process.cwd(), '.github', 'workflows');
const pendientes = [];

for (const nombre of fs.readdirSync(directorio).filter((f) => /\.ya?ml$/i.test(f)).sort()) {
  const ruta = path.join(directorio, nombre);
  const antes = fs.readFileSync(ruta, 'utf8');
  let despues = antes;

  for (const [accion, sha] of Object.entries(SHA_ESPERADOS)) {
    const patron = new RegExp(`(^\\s*-?\\s*uses:\\s*)${accion.replace(/\//g, '\\/')}@[^\\s#]+[^\\S\\n]*(?:#[^\\n]*)?$`, 'gm');
    despues = despues.replace(patron, `$1${accion}@${sha} # v7`);
  }

  if (despues === antes) continue;

  const viejas = antes.split('\n');
  const nuevas = despues.split('\n');
  const lineas = viejas
    .map((linea, i) => ({ n: i + 1, antes: linea.trim(), despues: (nuevas[i] || '').trim() }))
    .filter((x) => x.antes !== x.despues);
  pendientes.push({ nombre, ruta, despues, lineas });
}

if (!pendientes.length) {
  console.log('[fijar-acciones] nada que hacer: todas las acciones externas ya están fijadas por SHA.');
  process.exit(0);
}

console.log(`[fijar-acciones] ${aplicar ? 'APLICANDO' : 'ENSAYO (no se escribe nada)'}`);
for (const archivo of pendientes) {
  console.log(`\n${archivo.nombre}`);
  archivo.lineas.forEach((x) => {
    console.log(`  línea ${x.n}`);
    console.log(`    - ${x.antes}`);
    console.log(`    + ${x.despues}`);
  });
  if (aplicar) fs.writeFileSync(archivo.ruta, archivo.despues, 'utf8');
}

if (aplicar) {
  console.log('\nHecho. Ahora, desde la carpeta del repositorio:');
  console.log('  git add .github/workflows');
  console.log('  git commit -m "ci: fijar acciones por SHA"');
  console.log('  git push');
  console.log('\nComprueba después: node scripts/audit-workflow-pinning.js');
} else {
  console.log('\nNada escrito. Para aplicarlo: npm run fijar:workflows -- --aplicar');
}
