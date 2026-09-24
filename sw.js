/* Nutretium PWA service worker — never caches functions, checkout or authenticated/account APIs */
'use strict';
// Subir la versión al cambiar la estrategia: activate borra las cachés viejas.
// La v2 servía JS y CSS desde caché para siempre, y con products-data.js
// atrasado el cliente veía precios viejos y el cobro le devolvía 409.
const CACHE='nutretium-shell-v3';
const SHELL=['/','/styles.css','/commercial-finish.css','/smart-store.css','/smart-store-engine.js','/smart-store.js','/products-data.js','/pwa-icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>null));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('nutretium-shell-')).map(k=>caches.delete(k)))));self.clients.claim()});
function sensitive(url){return url.pathname.startsWith('/.netlify/functions/')||/checkout|pago|payment|cuenta|mi-nutretium|mi-cuenta|admin|backoffice|enterprise/i.test(url.pathname)}
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin||sensitive(url))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{const clone=res.clone();if(res.ok)caches.open(CACHE).then(c=>c.put(req,clone)).catch(()=>{});return res}).catch(()=>caches.match(req).then(r=>r||caches.match('/'))));return;
  }
  const guarda=res=>{if(res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone)).catch(()=>{})}return res};
  // Código y estilos: primero la red (precios y lógica siempre al día) y la
  // caché solo sin conexión.
  if(['script','style'].includes(req.destination)||SHELL.includes(url.pathname)){
    event.respondWith(fetch(req).then(guarda).catch(()=>caches.match(req).then(r=>r||Response.error())));return;
  }
  // Imágenes y fuentes: se sirve lo guardado al instante y se refresca detrás,
  // para que una foto sustituida desde el panel acabe llegando.
  if(['image','font'].includes(req.destination)){
    event.respondWith(caches.match(req).then(hit=>{const red=fetch(req).then(guarda);if(hit){red.catch(()=>{});return hit}return red}));
  }
});
