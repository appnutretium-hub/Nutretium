# Buzón de fotos nuevas

Suelta aquí las fotos que vayan llegando y lanza el script: él las trata y las
enlaza a su producto. **Esta carpeta no se publica**; las fotos ya tratadas van
a `sources/productos/`.

## En tres pasos

**1.** Copia las fotos a esta carpeta (`sources/_nuevas`).

**2.** Ensayo — no toca nada, solo enseña qué foto iría a qué producto:

```bash
node scripts/fotos-incorporar.js
```

**3.** Si el reparto es correcto, aplícalo:

```bash
node scripts/fotos-incorporar.js --aplicar
```

Cuando termine, abre la web y míralas. Los originales se quedan aquí: bórralos
cuando estés conforme.

## Cómo nombrar los archivos

**Lo seguro: el código del producto delante, y después dos guiones bajos.** Lo
que venga detrás da igual, sirve para que tú reconozcas el archivo.

```
00347__milkshake banana.jpg
ABB-1000__bowl acai grande.jpg
00505__cualquier cosa.png
```

Los códigos están en `sources/productos/FOTOS_PENDIENTES.md`, que lista todos
los productos a los que les falta foto.

**Si varios productos comparten la misma foto** (los packs de agua, el mismo
helado en 100 ml y 460 ml…), pon los códigos separados por `+`:

```
00500+00532+00539__agua aquadeus 1,5 l.jpg
00485+00491__helado moka fuel protzen.jpg
```

**Si el archivo no lleva código**, el script intenta adivinar el producto por el
nombre y lo marca con `?` en el listado. Eso **hay que revisarlo**: una foto en
la ficha equivocada es peor que no tener foto. Si no lo tienes claro, renombra.

## Qué formato

| | |
|---|---|
| Formatos | `.jpg`, `.png`, `.webp`, `.tif` |
| **NO** | `.heic` — es lo que graba el iPhone por defecto y el script no lo abre |
| Tamaño | cuanto más grande mejor: el script reduce, pero no puede inventar detalle |

Para quitar el HEIC del iPhone: **Ajustes › Cámara › Formatos › Más compatible**.
Las fotos que ya tengas en HEIC se convierten compartiéndolas por correo o
WhatsApp, que las pasa a JPG.

## Qué hace el script con cada foto

Lo mismo que se hizo con las 30 fotos AMRO que ya están en la web:

1. endereza la foto según la orientación de la cámara;
2. recorta el borde si es de un color uniforme;
3. centra el producto en un lienzo de 800 × 800 con margen, sobre fondo blanco;
4. la guarda en `.webp` por debajo de 150 KB;
5. escribe la ruta en `products-data.js`, en la línea del producto.

Si la foto ya viene bien encuadrada y no quieres que recorte nada:

```bash
node scripts/fotos-incorporar.js --aplicar --sin-recorte
```

## Consejos para las fotos de la tienda

Los bowls, yogures, smoothies, cafés y caprichos son recetas de la casa: no
existen en internet, hay que fotografiarlos aquí. Con el móvil basta:

- **Fondo liso.** Una cartulina blanca o una pared clara detrás y debajo.
- **Luz de ventana**, de lado. Nada de flash.
- **El producto centrado y entero**, con aire alrededor. El script recorta y
  centra él, pero no puede recuperar lo que se salió del encuadre.
- **Mismo fondo y misma luz para todos.** Es lo que hace que el catálogo parezca
  de una tienda y no un collage.
- Un plano por producto es suficiente. Si un bowl va en tres tamaños, una sola
  foto vale para los tres (nómbrala con los tres códigos y un `+`).
