'use strict';

const fs = require('fs');
const path = require('path');

const workflowDir = path.join(process.cwd(), '.github', 'workflows');
const expected = {
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node': '820762786026740c76f36085b0efc47a31fe5020',
};
const failures = [];

for (const name of fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/i.test(f)).sort()) {
  const source = fs.readFileSync(path.join(workflowDir, name), 'utf8');
  for (const match of source.matchAll(/\buses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
    const spec = match[1];
    const at = spec.lastIndexOf('@');
    if (at < 1) {
      failures.push(`${name}: acción sin referencia fija: ${spec}`);
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
console.log('[workflow-pinning] OK · todas las GitHub Actions están fijadas por SHA inmutable');
