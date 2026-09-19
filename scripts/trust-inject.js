'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'index.html');
const tag = '  <script src="trust-fixes.js"></script>\n';
let html = fs.readFileSync(file, 'utf8');

if (!html.includes('trust-fixes.js')) {
  const marker = '  <script src="animations.js"></script>';
  if (!html.includes(marker)) {
    throw new Error('No se encontró el punto seguro de inyección en index.html');
  }
  html = html.replace(marker, `${tag}${marker}`);
  fs.writeFileSync(file, html, 'utf8');
  console.log('[trust-inject] trust-fixes.js inyectado en index.html');
} else {
  console.log('[trust-inject] index.html ya contiene trust-fixes.js');
}
