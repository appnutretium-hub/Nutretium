// Pruebas de la valoración de carritos en el servidor.
// Uso: node scripts/test-precios.js   (sale con código 1 si algo falla)
'use strict';
require('./test-env');
const path = require('path').join(__dirname, '..') + '/';
const { valorarCarrito } = require(path+'netlify/lib/catalogo.js');
const { NUTRETIUM_PRODUCTS } = require(path+'products-data.js');

const whey2k = NUTRETIUM_PRODUCTS.find(p=>p.code==='00318'); // 74.90, stock 2
const nac    = NUTRETIUM_PRODUCTS.find(p=>p.code==='AMRO-NAC-120'); // 23.90, stock 10
const agotado= NUTRETIUM_PRODUCTS.find(p=>p.active!==false && p.stock===0);

let fallos=0;
function comprueba(titulo, real, esperado){
  const ok = JSON.stringify(real)===JSON.stringify(esperado);
  if(!ok) fallos++;
  console.log((ok?'  OK  ':'FALLO ')+titulo);
  if(!ok) console.log('        esperado:',JSON.stringify(esperado),'\n        real:    ',JSON.stringify(real));
}

// 1. Carrito legítimo
let r = valorarCarrito([{id:whey2k.id, code:whey2k.code, qty:2},{id:nac.id, code:nac.code, qty:1}]);
comprueba('carrito legítimo: total = 74,90x2 + 23,90 = 173,70 €', [r.ok, r.totalCents], [true, 17370]);

// 2. EL ATAQUE: el navegador dice que el Whey cuesta 1 céntimo
r = valorarCarrito([{id:whey2k.id, code:whey2k.code, qty:2, price:0.01, name:'regalo'}]);
comprueba('precio inyectado por el cliente: se ignora, cobra 149,80 €', [r.ok, r.totalCents], [true, 14980]);

// 3. Nombre falseado: el servidor usa el del catálogo
r = valorarCarrito([{id:nac.id, code:nac.code, qty:1, name:'<script>x</script>'}]);
comprueba('nombre falseado: se sustituye por el del catálogo', r.lineas[0].name, nac.name);

// 4. id que no existe
r = valorarCarrito([{id:99999, code:'X', qty:1}]);
comprueba('id inexistente: rechazado', r.ok, false);

// 5. code que no cuadra con el id (catálogo distinto en la página)
r = valorarCarrito([{id:whey2k.id, code:'00001', qty:1}]);
comprueba('code que no cuadra con el id: rechazado', r.ok, false);

// 6. code ausente
r = valorarCarrito([{id:whey2k.id, qty:1}]);
comprueba('sin code: rechazado', r.ok, false);

// 7. Por encima del stock (Whey 2kg tiene stock 2)
r = valorarCarrito([{id:whey2k.id, code:whey2k.code, qty:5}]);
comprueba('5 uds con stock 2: rechazado', r.ok, false);

// 8. Stock repartido en varias líneas: 2 + 2 = 4 > 2
r = valorarCarrito([{id:whey2k.id,code:whey2k.code,qty:2},{id:whey2k.id,code:whey2k.code,qty:2}]);
comprueba('stock troceado en 2 líneas: rechazado', r.ok, false);

// 9. Producto agotado y publicado
r = valorarCarrito([{id:agotado.id, code:agotado.code, qty:1}]);
comprueba('producto agotado ('+agotado.code+'): rechazado', r.ok, false);

// 10. Cantidades tramposas
for (const q of [0, -3, 1.5, 1e9, '2; DROP', null]) {
  r = valorarCarrito([{id:nac.id, code:nac.code, qty:q}]);
  comprueba('cantidad '+JSON.stringify(q)+': rechazada', r.ok, false);
}

// 11. Carrito vacío y no-array
comprueba('carrito vacío: rechazado', valorarCarrito([]).ok, false);
comprueba('items no es un array: rechazado', valorarCarrito('todo gratis').ok, false);

// 12. Sin errores de coma flotante (0.1+0.2).
// Solo se usan productos realmente publicables; incluir productos active=false
// hacía que el test esperase un carrito válido que el servidor debe rechazar.
const baratos = NUTRETIUM_PRODUCTS.filter(p=>p.active!==false && p.price>0 && p.stock>3).slice(0,12);
r = valorarCarrito(baratos.map(p=>({id:p.id,code:p.code,qty:3})));
const aMano = baratos.reduce((s,p)=>s+Math.round(p.price*100)*3,0);
comprueba('12 líneas x3 uds: suma exacta en céntimos', [r.ok, r.totalCents], [true, aMano]);

console.log(fallos===0 ? '\nTodo correcto.' : `\n${fallos} FALLOS`);
process.exit(fallos?1:0);