/* Nutretium PWA service worker — never caches functions, checkout or authenticated/account APIs */
'use strict';
const CACHE='nutretium-shell-v2';
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
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok&&['style','script','image','font'].includes(req.destination)){const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone)).catch(()=>{})}return res})));
});
