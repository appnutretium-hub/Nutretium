/**
 * admin.js — NUTRETIUM
 *
 * El panel de catálogo. Precios, stock, altas, bajas, fotos y qué se publica.
 *
 * Funciona en dos sitios con el mismo código:
 *
 *   MODO 'online'  en la tienda (/admin.html). Habla con la función
 *                  admin-catalogo, que comprueba la sesión y publica haciendo
 *                  un commit al repositorio. Netlify despliega solo.
 *   MODO 'local'   con `npm run panel`, en el ordenador del desarrollador.
 *                  Habla con scripts/panel-servidor.js y escribe los archivos
 *                  directamente. Publicar sigue siendo un git push a mano.
 *
 * Lo único que cambia entre los dos es TRANSPORTE. Las comprobaciones de lo que
 * se puede publicar están en el servidor —el mismo validador para las tres vías
 * de edición, contando el Excel— y aquí no se repiten: de nada serviría, porque
 * esta página se puede modificar desde el navegador.
 */

'use strict';

// El panel local escucha en el 4180; en la tienda, la página va por el puerto
// normal. Es la única diferencia que necesita saber el navegador.
const MODO = (location.port === '4180') ? 'local' : 'online';

const SESION = 'nutretium_user';   // la misma llave que usa app.js

// ── Estado ──────────────────────────────────────────────────────────────────

// 'original' es lo que hay publicado y 'productos' lo que se está editando.
// Compararlos es lo que permite enseñar qué se ha tocado y no dejar guardar
// cuando no hay nada que guardar.
let productos = [];
let original = [];
let categorias = [];
let vetados = [];

// Fotos elegidas y todavía sin guardar: código → {base64, extension, vistaPrevia}.
// Viajan con el guardado para que catálogo y foto entren de una vez; si fueran
// aparte habría un momento con la ficha apuntando a un archivo inexistente.
const fotosPendientes = new Map();

let productoDeLaFoto = null;

const $ = (id) => document.getElementById(id);
const clon = (v) => JSON.parse(JSON.stringify(v));
const claveDe = (p) => String(p.codigo || '').trim().toUpperCase();

function escapa(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── Sesión (solo en modo online) ────────────────────────────────────────────

function sesion() {
  try { return JSON.parse(localStorage.getItem(SESION) || 'null'); }
  catch { return null; }
}

const token = () => (sesion() || {}).token || '';

// Salir recarga la página, y el aviso de «tienes cambios sin guardar» bloquea
// las recargas. Sin esta bandera, pulsar Salir con algo a medias no hacía nada
// visible: el navegador cancelaba la recarga y parecía que el botón no iba.
let saliendoAPosta = false;

function cierraSesion() {
  const salir = () => {
    saliendoAPosta = true;
    localStorage.removeItem(SESION);
    location.reload();
  };

  if (!resumenCambios().hayCambios) { salir(); return; }

  abreDialogo(
    '<h2>Salir sin ' + (MODO === 'online' ? 'publicar' : 'guardar') + '</h2>' +
    '<p>Tienes cambios a medias. Si sales ahora se pierden.</p>',
    [
      { texto: 'Seguir editando', alPulsar: cierra },
      { texto: 'Salir igualmente', clase: 'primario', alPulsar: salir },
    ]);
}

// ── Transporte ──────────────────────────────────────────────────────────────

async function pideOnline(cuerpo) {
  const respuesta = await fetch('/.netlify/functions/admin-catalogo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
    body: JSON.stringify(cuerpo),
  });
  const datos = await respuesta.json().catch(() => ({}));
  return { estado: respuesta.status, datos };
}

async function pideLocal(ruta, cuerpo) {
  const respuesta = await fetch(ruta, {
    method: cuerpo ? 'POST' : 'GET',
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  return { estado: respuesta.status, datos };
}

const API = {
  local: {
    estado: () => pideLocal('/api/estado'),
    ensayo: (lista) => pideLocal('/api/ensayo', { productos: lista }),
    guardar: (lista, veto, fotos) => pideLocal('/api/guardar', { productos: lista, vetados: veto, fotos }),
  },
  online: {
    estado: () => pideOnline({ action: 'estado' }),
    ensayo: (lista) => pideOnline({ action: 'ensayo', productos: lista }),
    guardar: (lista, veto, fotos) => pideOnline({ action: 'publicar', productos: lista, vetados: veto, fotos }),
  },
}[MODO];

// ── Arranque ────────────────────────────────────────────────────────────────

async function arranca() {
  const { estado, datos } = await API.estado();

  if (estado === 401 || estado === 403) {
    muestraAcceso(datos.error || 'Esta cuenta no tiene acceso al panel.');
    return;
  }
  if (estado !== 200) {
    muestraAcceso(datos.error || 'El panel no está disponible ahora mismo.', true);
    return;
  }

  categorias = datos.categorias;
  vetados = datos.vetados || [];
  productos = datos.productos;
  original = clon(datos.productos);

  $('acceso').hidden = true;
  $('panel').hidden = false;
  $('btnSalir').hidden = MODO !== 'online';
  $('btnGuardar').textContent = MODO === 'online' ? 'Publicar cambios' : 'Guardar cambios';
  pintaAviso(datos);

  $('filtroCategoria').innerHTML = '<option value="">Todas las categorías</option>' +
    categorias.map((c) => '<option>' + escapa(c) + '</option>').join('');
  pinta();
}

function pintaAviso(datos) {
  if (MODO === 'local') {
    $('avisoModo').innerHTML =
      'Panel local. Guardar escribe en los archivos del proyecto; para que se vea en ' +
      '<strong>nutretium.com</strong> hay que subirlo después con git ' +
      '(paso 4 de <code>sources/_catalogo/LEEME.md</code>).';
    return;
  }

  $('avisoModo').innerHTML =
    'Al publicar se guarda en <code>' + escapa(datos.repositorio || '') + '</code> y la web se ' +
    'actualiza sola en uno o dos minutos. Sesión: <strong>' + escapa(datos.administrador || '') + '</strong>.';
}

function muestraAcceso(mensaje, soloMensaje) {
  $('panel').hidden = true;
  $('acceso').hidden = false;
  $('pieAcceso').textContent = mensaje;
  if (soloMensaje) $('formAcceso').querySelectorAll('label, button').forEach((e) => { e.hidden = true; });
}

$('formAcceso').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boton = $('botonAcceso');
  const error = $('errorAcceso');
  error.textContent = '';
  boton.disabled = true;
  boton.textContent = 'Entrando…';

  try {
    const respuesta = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: $('accesoEmail').value.trim(),
        password: $('accesoClave').value,
      }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo entrar.');

    localStorage.setItem(SESION, JSON.stringify(datos.user));
    // Quién es administrador lo decide el servidor, no este 'role': se guarda
    // solo para que la tienda pueda enseñar el enlace al panel.
    await arranca();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
});

$('btnSalir').onclick = cierraSesion;

// ── Estado de los cambios ───────────────────────────────────────────────────

function comparables(lista) {
  const mapa = new Map();
  lista.forEach((p) => mapa.set(claveDe(p), JSON.stringify(p)));
  return mapa;
}

function resumenCambios() {
  const antes = comparables(original);
  const ahora = comparables(productos);
  let altas = 0, bajas = 0, tocados = 0;
  ahora.forEach((valor, clave) => {
    if (!antes.has(clave)) altas++;
    else if (antes.get(clave) !== valor) tocados++;
  });
  antes.forEach((_, clave) => { if (!ahora.has(clave)) bajas++; });
  const fotos = fotosPendientes.size;
  return { altas, bajas, tocados, fotos, hayCambios: altas + bajas + tocados + fotos > 0 };
}

function estadoDeFila(p) {
  if (fotosPendientes.has(claveDe(p))) return 'tocado';
  const antes = original.find((o) => claveDe(o) === claveDe(p));
  if (!antes) return 'nuevo';
  return JSON.stringify(antes) === JSON.stringify(p) ? '' : 'tocado';
}

function actualizaCabecera() {
  const { altas, bajas, tocados, fotos, hayCambios } = resumenCambios();
  const publicados = productos.filter((p) => p.activo).length;
  const partes = [productos.length + ' productos', publicados + ' publicados'];

  if (hayCambios) {
    const detalle = [];
    if (altas) detalle.push(altas + (altas > 1 ? ' altas' : ' alta'));
    if (bajas) detalle.push(bajas + (bajas > 1 ? ' bajas' : ' baja'));
    if (tocados) detalle.push(tocados + (tocados > 1 ? ' modificados' : ' modificado'));
    if (fotos) detalle.push(fotos + (fotos > 1 ? ' fotos nuevas' : ' foto nueva'));
    partes.push('· sin ' + (MODO === 'online' ? 'publicar' : 'guardar') + ': ' + detalle.join(', '));
  }

  $('recuento').textContent = partes.join(' · ');
  $('btnGuardar').disabled = !hayCambios;
  $('btnDeshacer').disabled = !hayCambios;
}

// ── Tabla ───────────────────────────────────────────────────────────────────

function filtrados() {
  const texto = $('buscar').value.trim().toLowerCase();
  const categoria = $('filtroCategoria').value;
  const soloOcultos = $('filtroOcultos').checked;
  const soloSinFoto = $('filtroSinFoto').checked;
  const soloAgotados = $('filtroAgotados').checked;

  return productos.filter((p) => {
    if (categoria && p.categoria !== categoria) return false;
    if (soloOcultos && p.activo) return false;
    if (soloSinFoto && (p.foto || fotosPendientes.has(claveDe(p)))) return false;
    if (soloAgotados && !(p.stock !== null && Number(p.stock) <= 0)) return false;
    if (!texto) return true;
    return (p.nombre + ' ' + p.codigo + ' ' + p.marca).toLowerCase().includes(texto);
  });
}

function fondoDeFoto(p) {
  const pendiente = fotosPendientes.get(claveDe(p));
  if (pendiente) return "style=\"background-image:url('" + pendiente.vistaPrevia + "')\"";
  if (p.foto) return "style=\"background-image:url('/" + escapa(p.foto) + "')\"";
  return '';
}

function pinta() {
  const lista = filtrados();

  $('tabla').innerHTML = lista.map((p) => {
    const i = productos.indexOf(p);
    const pendiente = fotosPendientes.has(claveDe(p));
    const tieneFoto = pendiente || p.foto;
    const clases = [estadoDeFila(p), p.activo ? '' : 'oculto'].filter(Boolean).join(' ');
    return '' +
      '<tr class="' + clases + '" data-i="' + i + '">' +
        '<td><button class="miniatura' + (pendiente ? ' pendiente' : '') + '" data-accion="foto" ' +
          fondoDeFoto(p) + ' title="' + (tieneFoto ? 'Cambiar la foto' : 'Poner una foto') + '">' +
          (tieneFoto ? '' : escapa(p.emoji || '📷')) + '</button></td>' +
        '<td class="codigo">' + escapa(p.codigo) + '</td>' +
        '<td class="celda-nombre"><input data-campo="nombre" value="' + escapa(p.nombre) + '"></td>' +
        '<td><select data-campo="categoria">' +
          categorias.map((c) => '<option ' + (c === p.categoria ? 'selected' : '') + '>' + escapa(c) + '</option>').join('') +
        '</select></td>' +
        '<td class="centro"><input class="num" data-campo="precio" type="number" min="0" step="0.01" value="' + p.precio + '"></td>' +
        '<td class="centro"><input class="num" data-campo="stock" value="' + (p.stock === null ? 'siempre' : p.stock) + '" ' +
          'title="Un número de unidades, o «siempre» si no se controla el stock"></td>' +
        '<td class="centro"><input data-campo="activo" type="checkbox" ' + (p.activo ? 'checked' : '') + '></td>' +
        '<td class="centro"><input data-campo="destacado" type="checkbox" ' + (p.destacado ? 'checked' : '') + '></td>' +
        '<td><input class="corto" data-campo="marca" value="' + escapa(p.marca) + '"></td>' +
        '<td><input class="corto" data-campo="etiqueta" value="' + escapa(p.etiqueta) + '"></td>' +
        '<td><button class="peligro" data-accion="quitar" title="Quitar del catálogo">✕</button></td>' +
      '</tr>';
  }).join('');

  $('vacio').hidden = lista.length > 0;
  $('recuentoFiltro').textContent = lista.length === productos.length
    ? '' : 'mostrando ' + lista.length + ' de ' + productos.length;
  actualizaCabecera();
}

// Las ediciones no repintan la tabla: hacerlo en cada tecla movería el cursor
// de sitio. Solo se actualiza el modelo y el recuento de arriba.
$('tabla').addEventListener('input', (ev) => {
  const campo = ev.target.dataset.campo;
  if (!campo) return;
  const fila = ev.target.closest('tr');
  const p = productos[Number(fila.dataset.i)];

  if (campo === 'activo' || campo === 'destacado') {
    p[campo] = ev.target.checked;
    if (campo === 'activo') fila.classList.toggle('oculto', !p.activo);
  } else if (campo === 'precio') {
    p.precio = ev.target.value === '' ? '' : Number(ev.target.value);
  } else if (campo === 'stock') {
    const valor = ev.target.value.trim().toLowerCase();
    const numero = Number(valor);
    p.stock = (valor === '' || valor === 'siempre') ? null
      : (Number.isFinite(numero) && valor !== '' ? numero : valor);
  } else {
    p[campo] = ev.target.value;
  }

  const estado = estadoDeFila(p);
  fila.classList.toggle('tocado', estado === 'tocado');
  fila.classList.toggle('nuevo', estado === 'nuevo');
  actualizaCabecera();
});

$('tabla').addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-accion]');
  if (!boton) return;
  const p = productos[Number(boton.closest('tr').dataset.i)];
  if (boton.dataset.accion === 'foto') pideFoto(p);
  if (boton.dataset.accion === 'quitar') confirmaBaja(p);
});

['buscar', 'filtroCategoria', 'filtroOcultos', 'filtroSinFoto', 'filtroAgotados']
  .forEach((id) => $(id).addEventListener('input', pinta));

// ── Diálogos ────────────────────────────────────────────────────────────────

function abreDialogo(html, botones) {
  if ($('dialogo').open) $('dialogo').close();
  $('cuerpoDialogo').innerHTML = html;
  $('pieDialogo').innerHTML = '';
  botones.forEach(({ texto, clase, alPulsar }) => {
    const boton = document.createElement('button');
    boton.textContent = texto;
    if (clase) boton.className = clase;
    boton.onclick = () => alPulsar(boton);
    $('pieDialogo').appendChild(boton);
  });
  $('dialogo').showModal();
}

const cierra = () => $('dialogo').close();

const avisa = (titulo, mensaje) => abreDialogo(
  '<h2>' + escapa(titulo) + '</h2><p class="error">' + escapa(mensaje) + '</p>',
  [{ texto: 'Cerrar', clase: 'primario', alPulsar: cierra }]
);

// ── Alta ────────────────────────────────────────────────────────────────────

function anade() {
  abreDialogo(
    '<h2>Producto nuevo</h2>' +
    '<p style="color:var(--apagado)">El código es lo que identifica al producto para siempre: ' +
    'usa el mismo que tenga en el TPV de la tienda. No se puede cambiar después.</p>' +
    '<p><label>Código<br><input id="nuevoCodigo" placeholder="00540" style="width:100%"></label></p>' +
    '<p><label>Nombre<br><input id="nuevoNombre" placeholder="Barrita Proteica Cacao 60 g" style="width:100%"></label></p>' +
    '<p><label>Categoría<br><select id="nuevaCategoria" style="width:100%">' +
      categorias.map((c) => '<option>' + escapa(c) + '</option>').join('') +
    '</select></label></p>' +
    '<p><label>Precio de venta €<br><input id="nuevoPrecio" type="number" min="0" step="0.01" style="width:100%"></label></p>' +
    '<p id="errorAlta" class="error"></p>',
    [
      { texto: 'Cancelar', alPulsar: cierra },
      { texto: 'Añadir', clase: 'primario', alPulsar: () => {
        const codigo = $('nuevoCodigo').value.trim();
        const nombre = $('nuevoNombre').value.trim();
        const precio = Number($('nuevoPrecio').value);
        const error = $('errorAlta');

        if (!codigo) return void (error.textContent = 'Falta el código.');
        if (productos.some((p) => claveDe(p) === codigo.toUpperCase())) {
          return void (error.textContent = 'Ya hay un producto con el código ' + codigo + '.');
        }
        if (vetados.some((v) => v.codigo.toUpperCase() === codigo.toUpperCase())) {
          return void (error.textContent = codigo + ' está en la lista de productos que no se venden ' +
            'online. Hay que sacarlo de esa lista antes de poder publicarlo.');
        }
        if (!nombre) return void (error.textContent = 'Falta el nombre.');
        if (!(precio > 0)) return void (error.textContent = 'El precio tiene que ser mayor que cero.');

        productos.unshift({
          codigo, nombre, categoria: $('nuevaCategoria').value, precio,
          stock: 0, activo: true, destacado: false, etiqueta: '', marca: '', foto: '', emoji: '📷',
        });
        cierra();
        $('buscar').value = '';
        pinta();
      } },
    ]);
}

// ── Baja ────────────────────────────────────────────────────────────────────

function confirmaBaja(p) {
  abreDialogo(
    '<h2>Quitar «' + escapa(p.nombre) + '»</h2>' +
    '<p>Desaparece del catálogo y de la web.</p>' +
    '<p style="color:var(--apagado)">Si lo que quieres es dejar de venderlo un tiempo pero ' +
    'conservar su ficha, cierra esto y desmarca <strong>Publicado</strong>: se oculta de la ' +
    'web y vuelve con un clic.</p>' +
    '<p><label class="marca-check"><input type="checkbox" id="vetar"> ' +
    'No volver a publicarlo nunca (queda anotado en la lista de no vendibles, y no vuelve ' +
    'aunque se regenere el catálogo desde el ERP)</label></p>' +
    '<p id="motivoCaja" hidden><label>Motivo<br>' +
    '<input id="motivoVeto" style="width:100%" placeholder="Refresco de marca ajena: no se vende online"></label></p>',
    [
      { texto: 'Cancelar', alPulsar: cierra },
      { texto: 'Quitar', clase: 'primario', alPulsar: () => {
        if ($('vetar').checked) {
          vetados.push({ codigo: p.codigo, motivo: $('motivoVeto').value.trim() || 'Retirado desde el panel' });
        }
        fotosPendientes.delete(claveDe(p));
        productos = productos.filter((otro) => otro !== p);
        cierra();
        pinta();
      } },
    ]);
  $('vetar').onchange = (ev) => { $('motivoCaja').hidden = !ev.target.checked; };
}

// ── Fotos ───────────────────────────────────────────────────────────────────

const LIENZO = 800;   // lado del cuadrado final, igual que scripts/fotos-incorporar.js
const AIRE = 44;      // margen alrededor del producto

/**
 * Deja la foto como las del catálogo: centrada sobre fondo blanco en un cuadrado
 * de 800 × 800, y en webp. Se hace aquí y no en el servidor porque el panel
 * online corre dentro de una función de Netlify, donde no hay sitio donde
 * procesar imágenes; y haciéndolo igual en los dos modos, la foto sale igual se
 * suba desde donde se suba.
 *
 * Para tandas grandes sigue siendo mejor `npm run fotos`: ese además recorta el
 * borde sobrante de la foto original antes de encuadrarla.
 */
async function preparaFoto(archivo) {
  const imagen = await createImageBitmap(archivo);

  const lienzo = document.createElement('canvas');
  lienzo.width = LIENZO;
  lienzo.height = LIENZO;
  const pincel = lienzo.getContext('2d');
  pincel.fillStyle = '#ffffff';
  pincel.fillRect(0, 0, LIENZO, LIENZO);

  const util = LIENZO - AIRE * 2;
  const escala = Math.min(util / imagen.width, util / imagen.height);
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);
  pincel.drawImage(imagen, (LIENZO - ancho) / 2, (LIENZO - alto) / 2, ancho, alto);
  imagen.close();

  // Safari no supo exportar webp hasta hace poco: cuando no puede, devuelve un
  // PNG sin avisar. Se mira el tipo real y se cae a JPEG, que pesa parecido.
  let blob = await new Promise((listo) => lienzo.toBlob(listo, 'image/webp', 0.86));
  if (!blob || blob.type !== 'image/webp') {
    blob = await new Promise((listo) => lienzo.toBlob(listo, 'image/jpeg', 0.85));
  }
  if (!blob) throw new Error('Este navegador no ha podido preparar la imagen.');

  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const base64 = await new Promise((listo, falla) => {
    const lector = new FileReader();
    lector.onload = () => listo(String(lector.result).split(',').pop());
    lector.onerror = () => falla(new Error('No se pudo leer la imagen.'));
    lector.readAsDataURL(blob);
  });

  return { base64, extension, vistaPrevia: URL.createObjectURL(blob), kb: Math.round(blob.size / 1024) };
}

function pideFoto(p) {
  productoDeLaFoto = p;
  $('selectorFoto').value = '';
  $('selectorFoto').click();
}

$('selectorFoto').addEventListener('change', async (ev) => {
  const archivo = ev.target.files[0];
  const p = productoDeLaFoto;
  if (!archivo || !p) return;

  try {
    const preparada = await preparaFoto(archivo);
    const anterior = fotosPendientes.get(claveDe(p));
    if (anterior) URL.revokeObjectURL(anterior.vistaPrevia);
    fotosPendientes.set(claveDe(p), preparada);
    pinta();
  } catch (err) {
    avisa('No se pudo preparar la foto', err.message);
  }
});

/** Las fotos que van en el envío, con el código de su producto. */
function fotosParaEnviar() {
  return [...fotosPendientes.entries()].map(([codigo, foto]) => ({
    codigo, base64: foto.base64, extension: foto.extension,
  }));
}

// ── Informe ─────────────────────────────────────────────────────────────────

const INFORME_VACIO = { errores: [], avisos: [], altas: [], bajas: [], cambios: [] };

function pintaInforme(informe) {
  const datos = Object.assign({}, INFORME_VACIO, informe || {});
  const trozos = [];

  if (datos.errores.length) {
    trozos.push('<h3 class="error">Hay que corregir esto antes de continuar</h3><ul class="error">' +
      datos.errores.map((e) => '<li>' + escapa(e) + '</li>').join('') + '</ul>');
  }
  if (datos.altas.length) {
    trozos.push('<h3>Altas — ' + datos.altas.length + '</h3><ul class="alta">' +
      datos.altas.map((a) => '<li>' + escapa(a.codigo) + ' · ' + escapa(a.nombre) + ' · ' + a.precio + ' €</li>').join('') + '</ul>');
  }
  if (datos.bajas.length) {
    trozos.push('<h3>Bajas — ' + datos.bajas.length + '</h3><ul class="baja">' +
      datos.bajas.map((b) => '<li>' + escapa(b.codigo) + ' · ' + escapa(b.nombre) + '</li>').join('') + '</ul>');
  }
  if (datos.cambios.length) {
    trozos.push('<h3>Cambios — ' + datos.cambios.length + '</h3><ul>' +
      datos.cambios.map((c) => '<li>' + escapa(c.nombre) + '<ul>' +
        c.diferencias.map((d) => '<li>' + escapa(d) + '</li>').join('') + '</ul></li>').join('') + '</ul>');
  }
  if (fotosPendientes.size) {
    trozos.push('<h3>Fotos — ' + fotosPendientes.size + '</h3><ul>' +
      [...fotosPendientes.entries()].map(([codigo, f]) =>
        '<li>' + escapa(codigo) + ' · ' + f.kb + ' KB · ' + f.extension + '</li>').join('') + '</ul>');
  }
  if (datos.avisos.length) {
    trozos.push('<h3>Avisos</h3><ul>' + datos.avisos.map((a) => '<li>' + escapa(a) + '</li>').join('') + '</ul>');
  }
  if (!trozos.length) trozos.push('<p>No hay nada que cambiar.</p>');

  return trozos.join('');
}

// ── Guardar / publicar ──────────────────────────────────────────────────────

async function guarda() {
  const { estado, datos } = await API.ensayo(productos);

  if (estado === 401 || estado === 403) { muestraAcceso(datos.error || 'La sesión ha caducado.'); return; }
  if (!datos.informe) { avisa('No se pudo comprobar', datos.error || 'El panel no respondió.'); return; }

  const correcto = datos.ok === true;
  const enOnline = MODO === 'online';

  const cabecera = correcto
    ? '<h2>' + (enOnline ? 'Esto es lo que se va a publicar' : 'Esto es lo que se va a guardar') + '</h2>' +
      '<p style="color:var(--apagado)">El catálogo pasa de ' + datos.informe.totalAntes +
      ' a ' + datos.informe.total + ' productos.</p>'
    : '<h2>No se puede ' + (enOnline ? 'publicar' : 'guardar') + ' todavía</h2>';

  const botones = [{ texto: correcto ? 'Cancelar' : 'Cerrar', alPulsar: cierra }];

  if (correcto) {
    botones.push({
      texto: enOnline ? 'Publicar' : 'Guardar',
      clase: 'primario',
      alPulsar: (boton) => confirma(boton, enOnline),
    });
  }

  abreDialogo(cabecera + pintaInforme(datos.informe), botones);
}

async function confirma(boton, enOnline) {
  boton.disabled = true;
  boton.textContent = enOnline ? 'Publicando…' : 'Guardando…';

  const { estado, datos } = await API.guardar(productos, vetados, fotosParaEnviar());

  if (estado === 401 || estado === 403) { muestraAcceso(datos.error || 'La sesión ha caducado.'); return; }
  if (!datos.ok) {
    abreDialogo('<h2>No se pudo ' + (enOnline ? 'publicar' : 'guardar') + '</h2>' +
      pintaInforme(datos.informe || { errores: [datos.error || 'Error inesperado.'] }),
      [{ texto: 'Cerrar', clase: 'primario', alPulsar: cierra }]);
    return;
  }

  fotosPendientes.forEach((f) => URL.revokeObjectURL(f.vistaPrevia));
  fotosPendientes.clear();

  if (enOnline) {
    // Lo publicado es lo que ahora tiene el navegador: se recarga el estado
    // desde el servidor en la siguiente visita, no ahora, porque el despliegue
    // aún está en marcha y GitHub ya tiene el commit.
    original = clon(productos);
    pinta();
    abreDialogo(
      '<h2>Publicado</h2>' +
      '<p>El cambio ya está en el repositorio. La web se actualiza sola en <strong>uno o dos ' +
      'minutos</strong>: si la abres antes, todavía verás lo anterior.</p>' +
      (datos.commit ? '<p><a href="' + escapa(datos.commit.url) + '" target="_blank" rel="noopener">' +
        'Ver el cambio en GitHub</a></p>' : ''),
      [{ texto: 'Entendido', clase: 'primario', alPulsar: cierra }]);
    return;
  }

  categorias = datos.estado.categorias;
  vetados = datos.estado.vetados;
  productos = datos.estado.productos;
  original = clon(datos.estado.productos);
  pinta();

  abreDialogo(
    '<h2>Guardado</h2>' +
    '<p>El catálogo del proyecto ya está actualizado (' + datos.informe.total + ' productos).</p>' +
    '<h3>Falta un paso para que se vea en internet</h3>' +
    '<p>Los cambios están en tu ordenador. Para publicarlos en <strong>nutretium.com</strong> ' +
    'hay que subirlos con git — el paso 4 de <code>sources/_catalogo/LEEME.md</code>.</p>',
    [{ texto: 'Entendido', clase: 'primario', alPulsar: cierra }]);
}

function descarta() {
  abreDialogo(
    '<h2>Descartar los cambios</h2>' +
    '<p>Vuelve todo a como está en el catálogo publicado, incluidas las fotos elegidas ' +
    'y todavía sin guardar.</p>',
    [
      { texto: 'Seguir editando', alPulsar: cierra },
      { texto: 'Descartar', clase: 'primario', alPulsar: () => {
        fotosPendientes.forEach((f) => URL.revokeObjectURL(f.vistaPrevia));
        fotosPendientes.clear();
        productos = clon(original);
        cierra();
        pinta();
      } },
    ]);
}

$('btnAnadir').onclick = anade;
$('btnGuardar').onclick = guarda;
$('btnDeshacer').onclick = descarta;

window.addEventListener('beforeunload', (ev) => {
  if (saliendoAPosta || !resumenCambios().hayCambios) return;
  ev.preventDefault();
  ev.returnValue = '';   // los navegadores antiguos piden esto para avisar
});

arranca();
