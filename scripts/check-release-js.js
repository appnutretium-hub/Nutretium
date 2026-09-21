'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const root = process.cwd();
const ignored = new Set(['node_modules', 'dist', '.git', '_backup_pre_actualizacion']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}

function check(file) {
  return new Promise((resolve, reject) => execFile(process.execPath, ['--check', file], error => {
    if (error) reject(new Error(`Sintaxis inválida en ${path.relative(root, file)}\n${error.message}`));
    else resolve();
  }));
}

async function main() {
  walk(root);
  const pending = [...files];
  const workers = Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (pending.length) await check(pending.shift());
  });
  await Promise.all(workers);
  console.log(`[check-release-js] sintaxis válida en ${files.length} archivos JavaScript`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
