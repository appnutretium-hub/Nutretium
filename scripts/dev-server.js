// Servidor estático mínimo para previsualizar la tienda en local.
// Uso: node scripts/dev-server.js [--root dist] → http://localhost:4173
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

function requestedRoot(){
  const index=process.argv.indexOf('--root');
  if(index===-1)return path.join(__dirname,'..');
  const value=process.argv[index+1];
  if(!value||value.startsWith('--'))throw new Error('Falta el directorio después de --root.');
  return path.resolve(process.cwd(),value);
}
const ROOT = requestedRoot();
if(!fs.existsSync(ROOT)||!fs.statSync(ROOT).isDirectory())throw new Error(`Raíz estática inexistente: ${ROOT}`);
const PORT = process.env.PORT || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const initial = path.join(ROOT, rel);

  // Nunca servir fuera de la raíz del proyecto.
  const relativeToRoot=path.relative(ROOT,initial);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  const candidates = [initial];
  if (!path.extname(initial)) candidates.push(initial + '.html', path.join(initial, 'index.html'));
  const file = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || initial;
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado: ' + rel);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Nutretium en http://localhost:${PORT} · raíz ${ROOT}`));
