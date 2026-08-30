// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — busca la foto oficial de los productos de marca y la deja lista
//
// Fuente: Open Food Facts (openfoodfacts.org). Sus fotos las suben usuarios y se
// publican bajo CC-BY-SA 3.0: se pueden usar en una tienda citando la fuente.
// Es la única fuente que usamos: NO se descarga nada de webs de marca ni de
// buscadores de imágenes, porque esas fotos no tienen licencia de uso.
//
// Qué hace, por producto de scripts/fotos-consultas.json:
//   1. busca en Open Food Facts con la consulta curada;
//   2. descarta los candidatos que no contengan TODAS las palabras de 'must'
//      (es el seguro contra pegarle a un producto la foto de otro);
//   3. descarga la foto frontal a máxima resolución;
//   4. la recorta, la centra en un lienzo de 800 × 800 y la guarda en .webp,
//      igual que se trataron las 30 fotos AMRO (ver sources/productos/LEEME.md);
//   5. escribe scripts/_fotos_informe.csv para revisar a mano cada asignación.
//
// No modifica products-data.js: enlazar las fotos es un paso aparte y posterior
// a la revisión visual.
//
//   node scripts/fotos-buscar.js            → todos los pendientes
//   node scripts/fotos-buscar.js 00347 0035 → solo los códigos que empiecen así
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const CONSULTAS = require('./fotos-consultas.json').consultas;
const AGENTE = 'Nutretium-catalogo/1.0 (https://nutretium.com)';
const LIENZO = 800;      // lado del cuadrado final
const AIRE = 44;         // margen alrededor del producto, igual que en las fotos AMRO
const ESPERA_MS = 1200;  // cortesía con la API pública de Open Food Facts

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Sin acentos y en minúsculas, para comparar nombres sin sorpresas.
const normaliza = (s) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Ruta y nombre de archivo que le toca a cada producto (los fija NOMBRES_ESPERADOS.csv).
function rutasEsperadas() {
  const csv = fs.readFileSync(
    path.join(RAIZ, 'sources/productos/NOMBRES_ESPERADOS.csv'), 'utf8');
  const mapa = new Map();
  csv.split(/\r?\n/).slice(1).filter(Boolean).forEach((linea) => {
    const [categoria, codigo, ruta, tieneFoto] = linea.split(';');
    mapa.set(codigo, { categoria, ruta, tieneFoto });
  });
  return mapa;
}

// Buscador de Open Food Facts. Usamos el endpoint nuevo (search.openfoodfacts.org)
// porque el antiguo (/cgi/search.pl) devuelve 503 en cuanto encadenas consultas.
async function buscarEnOFF(consulta) {
  const url = 'https://search.openfoodfacts.org/search?' + new URLSearchParams({
    q: consulta,
    page_size: '25',
    fields: 'code,product_name,brands,quantity,countries_tags,image_url',
  });
  let ultimoFallo;
  for (let intento = 0; intento < 3; intento++) {
    const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (res.ok) return (await res.json()).hits || [];
    ultimoFallo = res.status;
    await espera(4000 * (intento + 1));
  }
  throw new Error(`Open Food Facts respondió ${ultimoFallo}`);
}

// Elige el mejor candidato: primero filtra por las palabras obligatorias y por
// tener foto, y luego puntúa (mercado español y nombre descriptivo).
// Las palabras obligatorias son el seguro contra colocarle a un producto la
// foto de otro sabor: sin ellas, la búsqueda difusa acierta poco.
function eligeCandidato(candidatos, must) {
  const marcas = (p) => (Array.isArray(p.brands) ? p.brands.join(' ') : p.brands || '');
  const validos = candidatos.filter((p) => {
    if (!p.image_url) return false;
    const texto = normaliza(`${p.product_name} ${marcas(p)} ${p.quantity}`);
    return must.every((palabra) => texto.includes(normaliza(palabra)));
  });
  return validos
    .map((p) => {
      let puntos = 0;
      const paises = (p.countries_tags || []).join(' ');
      if (/spain|espa/i.test(paises)) puntos += 3;
      if ((p.product_name || '').length > 6) puntos += 1;
      if (/front_(es|en)./.test(p.image_url)) puntos += 1;
      return { p, puntos };
    })
    .sort((a, b) => b.puntos - a.puntos)[0] ?.p || null;
}

async function descarga(url) {
  const res = await fetch(url, { headers: { 'User-Agent': AGENTE } });
  if (!res.ok) throw new Error(`descarga ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Recorta el borde uniforme, centra el producto en el lienzo y baja de 150 KB.
async function procesa(bufferOriginal, destino) {
  const recortado = await sharp(bufferOriginal)
    .flatten({ background: '#ffffff' })
    .trim({ threshold: 12 })
    .toBuffer()
    .catch(() => sharp(bufferOriginal).flatten({ background: '#ffffff' }).toBuffer());

  const base = sharp(recortado)
    .resize(LIENZO - AIRE * 2, LIENZO - AIRE * 2, {
      fit: 'contain',
      background: '#ffffff',
      withoutEnlargement: false,
    })
    .extend({
      top: AIRE, bottom: AIRE, left: AIRE, right: AIRE,
      background: '#ffffff',
    })
    .flatten({ background: '#ffffff' });

  let calidad = 86;
  let salida = await base.clone().webp({ quality: calidad }).toBuffer();
  while (salida.length > 150 * 1024 && calidad > 55) {
    calidad -= 8;
    salida = await base.clone().webp({ quality: calidad }).toBuffer();
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, salida);
  return { bytes: salida.length, calidad };
}

async function principal() {
  const filtros = process.argv.slice(2);
  const rutas = rutasEsperadas();
  const codigos = Object.keys(CONSULTAS)
    .filter((c) => !filtros.length || filtros.some((f) => c.startsWith(f)));

  const informe = [];
  for (const codigo of codigos) {
    const { q, must } = CONSULTAS[codigo];
    const esperada = rutas.get(codigo);
    if (!esperada) {
      console.log(`✗ ${codigo}  no está en NOMBRES_ESPERADOS.csv`);
      continue;
    }
    const destino = path.join(RAIZ, esperada.ruta);
    try {
      const candidatos = await buscarEnOFF(q);
      const elegido = eligeCandidato(candidatos, must);
      if (!elegido) {
        console.log(`✗ ${codigo}  sin candidato válido para "${q}"`);
        informe.push([codigo, esperada.ruta, '', '', '', '', '', 'SIN_CANDIDATO']);
        await espera(ESPERA_MS);
        continue;
      }
      const urlFoto = elegido.image_url.replace(/\.\d+\.400\.jpg$/, (m) =>
        m.replace('.400.', '.full.'));
      const original = await descarga(urlFoto).catch(() => descarga(elegido.image_url));
      const { bytes } = await procesa(original, destino);
      console.log(`✓ ${codigo}  ${elegido.product_name} [${elegido.brands}] ${(bytes / 1024).toFixed(0)} KB`);
      // El informe es CSV con ';': hay que limpiar los ';' del propio texto.
      const limpia = (v) => String(v ?? '').replace(/;/g, ',').trim();
      informe.push([
        codigo, esperada.ruta, limpia(elegido.product_name),
        limpia(Array.isArray(elegido.brands) ? elegido.brands.join(', ') : elegido.brands),
        limpia(elegido.code), urlFoto, String(bytes), 'OK',
      ]);
    } catch (err) {
      console.log(`✗ ${codigo}  ${err.message}`);
      informe.push([codigo, esperada.ruta, '', '', '', '', '', `ERROR: ${err.message}`]);
    }
    await espera(ESPERA_MS);
  }

  const cabecera = 'codigo;ruta;off_nombre;off_marca;off_ean;off_url;bytes;estado';
  const csv = [cabecera, ...informe.map((f) => f.join(';'))].join('\n');
  fs.writeFileSync(path.join(__dirname, '_fotos_informe.csv'), csv + '\n', 'utf8');
  const ok = informe.filter((f) => f[7] === 'OK').length;
  console.log(`\n${ok}/${informe.length} fotos descargadas → scripts/_fotos_informe.csv`);
}

principal();
