'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const output = path.join(root, 'styles.css');
const layers = ['human-touch.css', 'commerce-core.css'];

let css = fs.readFileSync(output, 'utf8');
for (const layer of layers) {
  const marker = `/* build-layer:${layer} */`;
  if (css.includes(marker)) continue;
  css += `\n${marker}\n${fs.readFileSync(path.join(root, layer), 'utf8')}\n`;
}
fs.writeFileSync(output, css, 'utf8');
console.log(`[append-build-css] ${layers.length} capas de interfaz incorporadas`);
