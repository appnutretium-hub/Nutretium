// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — monta las fotos descargadas en hojas de contactos para revisarlas
//
// scripts/fotos-buscar.js baja fotos de Open Food Facts, que las suben usuarios
// con el móvil: muchas no valen para una ficha de tienda (mano en el encuadre,
// desenfocadas, recortadas). Hay que mirarlas una a una y descartar.
//
// Esto junta las fotos en rejillas de 4 × 5 con el código debajo de cada una,
// para poder revisar 95 fotos en 5 imágenes en vez de abrirlas de una en una.
//
//   node scripts/fotos-hoja-contactos.js   → scripts/_hoja_contactos_N.jpg
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const COLUMNAS = 4;
const FILAS = 5;
const CELDA = 260;        // lado de la miniatura
const PIE = 30;           // franja para el código
const POR_HOJA = COLUMNAS * FILAS;

function fotosDescargadas() {
  const csv = fs.readFileSync(path.join(__dirname, '_fotos_informe.csv'), 'utf8');
  return csv.split(/\r?\n/).slice(1).filter(Boolean)
    .map((l) => l.split(';'))
    .filter((f) => f[7] === 'OK')
    .map((f) => ({ codigo: f[0], ruta: path.join(RAIZ, f[1]) }))
    .filter((f) => fs.existsSync(f.ruta));
}

// Etiqueta con el código, para poder decir después "descarta la 00347".
function etiqueta(texto) {
  const svg = `<svg width="${CELDA}" height="${PIE}">
    <rect width="100%" height="100%" fill="#111827"/>
    <text x="${CELDA / 2}" y="21" font-family="monospace" font-size="17"
          fill="#ffffff" text-anchor="middle">${texto}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function principal() {
  const fotos = fotosDescargadas();
  if (!fotos.length) return console.log('No hay fotos en _fotos_informe.csv');

  for (let hoja = 0; hoja * POR_HOJA < fotos.length; hoja++) {
    const lote = fotos.slice(hoja * POR_HOJA, (hoja + 1) * POR_HOJA);
    const capas = [];
    for (let i = 0; i < lote.length; i++) {
      const x = (i % COLUMNAS) * CELDA;
      const y = Math.floor(i / COLUMNAS) * (CELDA + PIE);
      capas.push({
        input: await sharp(lote[i].ruta).resize(CELDA, CELDA, { fit: 'contain', background: '#ffffff' }).toBuffer(),
        top: y, left: x,
      });
      capas.push({ input: etiqueta(lote[i].codigo), top: y + CELDA, left: x });
    }
    const destino = path.join(__dirname, `_hoja_contactos_${hoja + 1}.jpg`);
    await sharp({
      create: {
        width: COLUMNAS * CELDA,
        height: FILAS * (CELDA + PIE),
        channels: 3,
        background: '#e5e7eb',
      },
    }).composite(capas).jpeg({ quality: 82 }).toFile(destino);
    console.log(`hoja ${hoja + 1}: ${lote.length} fotos → ${path.relative(RAIZ, destino)}`);
  }
}

principal();
