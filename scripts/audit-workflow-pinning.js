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

function auditCheckoutCredentialPersistence(workflowName, source) {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/\buses:\s*actions\/checkout@/i.test(lines[i])) continue;
    const baseIndent = (lines[i].match(/^\s*/) || [''])[0].length;
    let block = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      const trimmed = line.trim();
      const indent = (line.match(/^\s*/) || [''])[0].length;
      if (trimmed && indent <= baseIndent && /^-\s|^[A-Za-z0-9_-]+:/.test(trimmed)) break;
      block += `\n${line}`;
    }
    if (!/persist-credentials\s*:\s*false\b/i.test(block)) {
      failures.push(`${workflowName}: actions/checkout debe declarar persist-credentials: false.`);
    }
  }
}

for (const name of fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/i.test(f)).sort()) {
  const source = fs.readFileSync(path.join(workflowDir, name), 'utf8');

  // El control plane declara automaticSourceCodeMutation=false. Los workflows
  // de CI deben ser de solo lectura sobre el repositorio: sin token de escritura,
  // sin eventos pull_request_target y sin pushes automáticos a ninguna rama.
  if (/^\s*pull_request_target\s*:/im.test(source)) {
    failures.push(`${name}: pull_request_target está prohibido; no se ejecutará código de PR con contexto privilegiado.`);
  }
  if (/^\s*contents\s*:\s*write\b/im.test(source)) {
    failures.push(`${name}: permissions.contents=write está prohibido; CI no puede mutar el source.`);
  }
  if (/\bpersist-credentials\s*:\s*true\b/im.test(source)) {
    failures.push(`${name}: persist-credentials:true está prohibido.`);
  }
  if (/\bgit\s+push\b/im.test(source)) {
    failures.push(`${name}: git push automático prohibido; los cambios de source deben pasar por una rama/PR revisable.`);
  }
  if (/\bgh\s+pr\s+merge\b/im.test(source)) {
    failures.push(`${name}: merge automático mediante gh pr merge prohibido.`);
  }
  if (/\bgh\s+api\b[^\n]*(?:--method|-X)\s+(?:POST|PUT|PATCH|DELETE)\b/im.test(source) && /api\.github\.com|repos\//i.test(source)) {
    failures.push(`${name}: mutación de GitHub mediante gh api prohibida en CI.`);
  }

  auditCheckoutCredentialPersistence(name, source);

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
  [...new Set(failures)].forEach((item) => console.error(` - ${item}`));
  process.exit(1);
}
console.log('[workflow-pinning] OK · acciones externas fijadas; checkout sin credenciales persistentes; CI sin privilegios/mutaciones de source');
