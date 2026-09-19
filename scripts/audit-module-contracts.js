'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const staff = require('../netlify/lib/staff');

const REQUIRED_STAFF_EXPORTS = [
  'roleFor', 'hasPermission', 'requireStaff', 'staffConfig',
  'rolesConfig', 'permisosDe', 'exigePermiso'
];
for (const name of REQUIRED_STAFF_EXPORTS) {
  assert.strictEqual(typeof staff[name], 'function', `netlify/lib/staff.js debe exportar ${name}()`);
}

const functionsDir = path.join(__dirname, '..', 'netlify', 'functions');
const files = fs.readdirSync(functionsDir).filter(name => name.endsWith('.js')).sort();
const errors = [];

for (const name of files) {
  const full = path.join(functionsDir, name);
  const source = fs.readFileSync(full, 'utf8');
  const rel = `netlify/functions/${name}`;

  for (const match of source.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(['"]\.\.\/lib\/staff['"]\)/g)) {
    const imported = match[1].split(',').map(v => v.trim().split(':')[0].trim()).filter(Boolean);
    for (const symbol of imported) {
      if (!(symbol in staff)) errors.push(`${rel}: importa ${symbol} desde staff.js pero no existe`);
    }
  }

  const asyncAuth = ['requireStaff', 'exigePermiso'];
  for (const fn of asyncAuth) {
    const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
    for (const match of source.matchAll(re)) {
      const before = source.slice(Math.max(0, match.index - 32), match.index);
      if (!/await\s*$/.test(before)) errors.push(`${rel}: ${fn}() es async y debe llamarse con await`);
    }
  }

  if (source.includes("require('../lib/admin')") || source.includes('require("../lib/admin")')) {
    const re = /\bexigeAdmin\s*\(/g;
    for (const match of source.matchAll(re)) {
      const before = source.slice(Math.max(0, match.index - 32), match.index);
      if (!/await\s*$/.test(before)) errors.push(`${rel}: exigeAdmin() es async y debe llamarse con await`);
    }
  }
}

if (errors.length) {
  console.error('[audit-module-contracts] FALLO');
  errors.forEach(error => console.error(` - ${error}`));
  process.exit(1);
}

console.log(`[audit-module-contracts] OK · ${files.length} funciones revisadas · contratos de autorización coherentes`);
