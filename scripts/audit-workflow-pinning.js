'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const workflowDir = path.join(repoRoot, '.github', 'workflows');
const expected = {
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node': '820762786026740c76f36085b0efc47a31fe5020',
};
const failures = [];

function validateLocalUse(workflowName, spec) {
  if (!spec.startsWith('./')) return false;
  const resolved = path.resolve(repoRoot, spec);
  const rootPrefix = `${path.resolve(repoRoot)}${path.sep}`;
  if (!resolved.startsWith(rootPrefix)) {
    failures.push(`${workflowName}: referencia local fuera del repositorio: ${spec}`);
    return true;
  }
  if (!fs.existsSync(resolved)) {
    failures.push(`${workflowName}: referencia local inexistente: ${spec}`);
  }
  return true;
}

for (const name of fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/i.test(f)).sort()) {
  const source = fs.readFileSync(path.join(workflowDir, name), 'utf8');

  // El control plane declara automaticSourceCodeMutation=false y la política de
  // origen de main solo permite PR fusionado o commits atómicos de catálogo.
  // Ningún workflow de CI puede saltarse esa frontera haciendo push directo.
  if (/\bgit\s+push\b[^\n]*(?:HEAD:main|(?:origin\s+)?main)(?:\s|$)/im.test(source)) {
    failures.push(`${name}: push directo automático a main prohibido; los cambios de source deben pasar por PR.`);
  }

  for (const match of source.matchAll(/\buses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
    const spec = match[1];
    if (validateLocalUse(name, spec)) continue;

    const at = spec.lastIndexOf('@');
    if (at < 1) {
      failures.push(`${name}: acción externa sin referencia fija: ${spec}`);
      continue;
    }
    const action = spec.slice(0, at);
    const ref = spec.slice(at + 1);
    if (!/^[0-9a-f]{40}$/i.test(ref)) failures.push(`${name}: ${action} no está fijada a SHA inmutable (${ref}).`);
    if (expected[action] && ref.toLowerCase() !== expected[action]) failures.push(`${name}: ${action} usa SHA distinto del v7 verificado (${ref}).`);
  }
}

if (failures.length) {
  console.error('[workflow-pinning] FAIL');
  failures.forEach((item) => console.error(` - ${item}`));
  process.exit(1);
}
console.log('[workflow-pinning] OK · acciones externas fijadas por SHA; referencias locales confinadas; sin pushes CI directos a main');
