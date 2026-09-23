// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — pruebas de la herramienta de catálogo
//
//   npm run test:catalogo
//
// La hoja de catálogo escribe los precios que después cobra el servidor, así que
// lo que se comprueba aquí no es que el CSV se lea bien: es que NO deje pasar
// nada que rompa el cobro. Un producto sin precio, una categoría inventada o un
// refresco vetado que vuelve son fallos que solo se verían en producción.
//
// Nada de esto escribe en disco: calcula() devuelve el catálogo que resultaría
// y lo comprueba en memoria. La última prueba verifica justo eso.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('./test-env');

const fs = require('fs');
const path = require('path');
const catalogo = require('./catalogo-actualizar.js');
const validador = require('../netlify/lib/catalogo-hoja.js');

const CATALOGO = path.join(catalogo.RAIZ, 'products-data.js');

let correctas = 0;
let fallidas = 0;

function comprueba(descripcion, condicion, detalle) {
  if (condicion) {
    correctas++;
    console.log(`  OK  ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  FALLA  ${descripcion}${detalle ? `\n         ${detalle}` : ''}`);
  }
}

// ── Punto de partida: la hoja que describe el catálogo actual ───────────────

const { productos, categorias } = catalogo.leeCatalogo();
const vetados = new Set(catalogo.leeNoVendibles().map((v) => v.codigo.toUpperCase()));

function filaDe(p, cambios = {}) {
  return {
    codigo: p.code,
    nombre: p.name,
    categoria: p.category,
    precio: catalogo.escribePrecio(Number(p.price)),
    stock: catalogo.comoTextoStock(p.stock),
    activo: catalogo.escribeSiNo(p.active !== false),
    destacado: catalogo.escribeSiNo(p.featured === true),
    etiqueta: p.badge || '',
    marca: p.brand || '',
    foto: p.image || '',
    ...cambios,
  };
}

const hojaFiel = () => productos.map((p, i) => ({ ...filaDe(p), __linea: i + 2 }));

const buscaError = (informe, aguja) => informe.errores.some((e) => e.includes(aguja));

// ── La hoja que no cambia nada no cambia nada ───────────────────────────────

console.log('\n── Hoja idéntica al catálogo ──');
{
  const informe = catalogo.calcula(hojaFiel());
  comprueba('sin errores', informe.errores.length === 0, informe.errores[0]);
  comprueba('sin altas, bajas ni cambios',
    !informe.altas.length && !informe.bajas.length && !informe.cambios.length,
    `altas ${informe.altas.length}, bajas ${informe.bajas.length}, cambios ${informe.cambios.length}`);
  comprueba('el catálogo resultante es el mismo',
    JSON.stringify(informe.resultado) === JSON.stringify(productos));
}

// ── Precios: es lo que se cobra ─────────────────────────────────────────────

console.log('\n── Precios ──');
{
  const casos = [
    ['vacío', ''],
    ['cero', '0'],
    ['negativo', '-5'],
    ['texto', 'gratis'],
    ['por encima del máximo', '9999'],
  ];
  for (const [nombre, precio] of casos) {
    const hoja = hojaFiel();
    hoja[0].precio = precio;
    const informe = catalogo.calcula(hoja);
    comprueba(`precio ${nombre}: rechazado`, informe.errores.length > 0);
    comprueba(`precio ${nombre}: el producto no entra en el catálogo`,
      !informe.resultado.some((p) => p.code === productos[0].code));
  }

  // Excel escribe coma decimal y quien copia de otro sitio trae punto o el euro.
  for (const escrito of ['12,50', '12.50', '12,50 €']) {
    const hoja = hojaFiel();
    hoja[0].precio = escrito;
    const informe = catalogo.calcula(hoja);
    const resultado = informe.resultado.find((p) => p.code === productos[0].code);
    comprueba(`precio escrito «${escrito}» → 12.5`, resultado && resultado.price === 12.5,
      resultado && String(resultado.price));
  }
}

// ── Categoría, código y stock ───────────────────────────────────────────────

console.log('\n── Campos que rompen la web ──');
{
  const hoja = hojaFiel();
  hoja[0].categoria = 'Chuches';
  const informe = catalogo.calcula(hoja);
  comprueba('categoría inexistente: rechazada', buscaError(informe, 'Chuches'));
  comprueba('el mensaje enumera las categorías válidas', buscaError(informe, categorias[0]));
}
{
  const hoja = hojaFiel();
  hoja[1].codigo = hoja[0].codigo;
  const informe = catalogo.calcula(hoja);
  comprueba('código repetido: rechazado', buscaError(informe, 'repetido'));
}
{
  const hoja = hojaFiel();
  hoja[0].codigo = '';
  const informe = catalogo.calcula(hoja);
  comprueba('código vacío: rechazado', buscaError(informe, 'falta el código'));
}
{
  for (const [nombre, stock] of [['con decimales', '2,5'], ['negativo', '-3'], ['texto', 'unos pocos']]) {
    const hoja = hojaFiel();
    hoja[0].stock = stock;
    comprueba(`stock ${nombre}: rechazado`, catalogo.calcula(hoja).errores.length > 0);
  }

  const hoja = hojaFiel();
  hoja[0].stock = 'siempre';
  const resultado = catalogo.calcula(hoja).resultado.find((p) => p.code === productos[0].code);
  comprueba('stock «siempre» → null (no se controla)', resultado && resultado.stock === null);
}
{
  const hoja = hojaFiel();
  hoja[0].foto = 'sources/productos/NO_EXISTE/nada.webp';
  const informe = catalogo.calcula(hoja);
  const resultado = informe.resultado.find((p) => p.code === productos[0].code);
  comprueba('foto inexistente: aviso, no error', informe.errores.length === 0 && informe.avisos.length > 0);
  comprueba('foto inexistente: el producto se publica sin foto', resultado && resultado.image === null);
}

// ── Texto que acaba dentro del HTML de la tienda ────────────────────────────

console.log('\n── Nombres peligrosos ──');
{
  for (const [campo, valor] of [
    ['nombre', 'Proteína <img src=x onerror=alert(1)>'],
    ['marca', 'Amro<script>'],
    ['etiqueta', '<b>Oferta</b>'],
  ]) {
    const filas = hojaFiel();
    filas[0][campo] = valor;
    const informe = catalogo.calcula(filas);
    comprueba(`${campo} con etiquetas HTML: rechazado`, buscaError(informe, '«<» ni «>»'));
  }

  const filas = hojaFiel();
  filas[0].nombre = 'x'.repeat(validador.MAX_NOMBRE + 1);
  comprueba('nombre kilométrico: rechazado',
    buscaError(catalogo.calcula(filas), `${validador.MAX_NOMBRE} caracteres`));
}

// ── Altas ───────────────────────────────────────────────────────────────────

console.log('\n── Altas ──');
{
  const idMaximo = productos.reduce((max, p) => Math.max(max, p.id), 0);
  const hoja = hojaFiel();
  hoja.push({
    codigo: 'ZZZ-PRUEBA', nombre: 'Producto de prueba', categoria: 'Creatinas',
    precio: '3,20', stock: '7', activo: 'SI', destacado: 'NO',
    etiqueta: 'Nuevo', marca: 'Nutretium', foto: '', __linea: 999,
  });
  const informe = catalogo.calcula(hoja);
  const alta = informe.altas[0];

  comprueba('el alta se detecta', informe.altas.length === 1);
  comprueba('toma el siguiente id libre', alta && alta.id === idMaximo + 1, alta && String(alta.id));
  comprueba('hereda el emoji de su categoría',
    alta && alta.emoji === productos.find((p) => p.category === 'Creatinas').emoji);
  comprueba('no se marca como baja de nadie', informe.bajas.length === 0);
}

// ── Bajas y lista negra ─────────────────────────────────────────────────────

console.log('\n── Bajas y lista de no vendibles ──');
{
  const hoja = hojaFiel();
  const quitado = hoja.shift();
  const informe = catalogo.calcula(hoja);
  comprueba('borrar la fila da de baja el producto',
    informe.bajas.length === 1 && informe.bajas[0].code === quitado.codigo);
}
{
  comprueba('la lista negra tiene los refrescos retirados',
    vetados.has('00514') && vetados.has('00516') && vetados.has('00526') && vetados.has('00506'),
    `${vetados.size} códigos vetados`);

  const hoja = hojaFiel();
  hoja.push({
    codigo: '00514', nombre: 'Coca-cola Normal', categoria: 'Bebidas', precio: '1,50',
    stock: '30', activo: 'SI', destacado: 'NO', etiqueta: '', marca: 'Coca-cola', foto: '', __linea: 998,
  });
  const informe = catalogo.calcula(hoja);
  comprueba('un vetado que vuelve a la hoja no se publica',
    !informe.resultado.some((p) => p.code === '00514'));
  comprueba('y se dice por qué', informe.excluidos.some((e) => e.codigo === '00514' && e.motivo));
  comprueba('sin dar error: la hoja no está mal, es que ese no se vende',
    informe.errores.length === 0, informe.errores[0]);
}

// ── Los id no se mueven ─────────────────────────────────────────────────────

console.log('\n── Identidad de los productos ──');
{
  // El id es la clave con la que el servidor cobra: reordenar la hoja no puede
  // reasignarlo, o se cobraría el precio de otro producto.
  const hoja = hojaFiel().reverse();
  hoja[0].precio = catalogo.escribePrecio(Number(hoja[0].precio.replace(',', '.')) + 1);
  const informe = catalogo.calcula(hoja);

  const desplazados = informe.resultado.filter((p) => {
    const antes = productos.find((o) => o.code === p.code);
    return antes && antes.id !== p.id;
  });
  comprueba('ordenar la hoja al revés no cambia ningún id', desplazados.length === 0,
    desplazados.map((p) => p.code).join(', '));
  comprueba('el catálogo sale ordenado por id',
    informe.resultado.every((p, i) => i === 0 || informe.resultado[i - 1].id < p.id));
  comprueba('el cambio de precio sí se detecta', informe.cambios.length === 1);
}

// ── Ensayo quiere decir ensayo ──────────────────────────────────────────────

console.log('\n── El ensayo no escribe ──');
{
  const antes = fs.readFileSync(CATALOGO, 'utf8');
  const hoja = hojaFiel();
  hoja[0].precio = '999999';
  hoja[1].categoria = 'Chuches';
  catalogo.calcula(hoja);
  comprueba('products-data.js sigue intacto tras un ensayo con errores',
    fs.readFileSync(CATALOGO, 'utf8') === antes);
}

console.log(`\n${correctas} correctas, ${fallidas} fallidas.`);
if (fallidas) {
  console.log('\nNo toques el catálogo hasta arreglarlo: esto es lo que evita');
  console.log('publicar productos que el pago no puede cobrar.');
  process.exitCode = 1;
}
