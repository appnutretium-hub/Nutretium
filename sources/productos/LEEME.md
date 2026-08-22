# Fotos de producto — convención de nombres

De los 179 productos del catálogo, **30 ya tienen foto** (las referencias AMRO /
American Rocket) y **149 siguen con `image: null`**: su ficha muestra el emoji de la
categoría hasta que exista una foto real. En cuanto subas una foto con el nombre
correcto, solo hay que enlazarla en `products-data.js` (ver "Cómo enlazar").

## Dónde va cada foto

```
sources/productos/<CATEGORIA>/<CODIGO>__<NOMBRE>.webp
```

- `<CATEGORIA>` — la carpeta ya creada de la categoría del producto (`BOWLS`, `BEBIDAS`, …).
- `<CODIGO>` — el código exacto del listado oficial (`ABB-1000`, `00347`…). **Es la clave**:
  es lo que permite cuadrar la foto con la fila del PDF y con el ERP.
- `<NOMBRE>` — el nombre en mayúsculas, sin acentos, con `_` en lugar de espacios.
- Doble guion bajo `__` entre código y nombre.

Ejemplos:

```
sources/productos/BOWLS/ABB-1000__ACAI_BERRY_BRUTAL_1000_ML.webp
sources/productos/BEBIDAS/00347__MILKSHAKE_BANANA_330ML_BAREBELLS.webp
sources/productos/ACCESORIOS_GYM/00155__PASTILLERO.webp
```

El archivo `NOMBRES_ESPERADOS.csv` de esta carpeta lista **la ruta esperada de cada
uno de los 179 productos** y una columna `tiene_foto` (`si`/`no`). Es la lista de la
compra: cada línea con `no` es un producto que todavía va con emoji.

## Formato

| | |
|---|---|
| Formato | `.webp` (mejor compresión; `.jpg` y `.png` también funcionan) |
| Tamaño | 800 × 800 px, cuadrado |
| Peso | por debajo de 150 KB |
| Fondo | liso o transparente — la ficha lo recorta con `object-contain` |

## Cómo enlazar las fotos una vez subidas

Las rutas que empiezan por `sources/` se renderizan con `object-contain` (producto
entero, sin recortar). Basta con poner la ruta en el campo `image` del producto:

```js
{ "id": 1, "code": "ABB-1000", …, "image": "sources/productos/BOWLS/ABB-1000__ACAI_BERRY_BRUTAL_1000_ML.webp", … }
```

Si la ruta apunta a un archivo que no existe, la ficha cae automáticamente al emoji
(`onerror` en `renderProducts`), así que un enlace roto nunca deja un hueco vacío.

## Las 30 fotos AMRO ya enlazadas

Salen de `sources/01_PNG_MAX_CALIDAD_CON_PVP/` (22 PNG del distribuidor, ver el
`LEEME.txt` de `sources/`). Tratamiento aplicado:

1. Se recorta el marco/relleno uniforme del PNG original hasta el borde del producto.
2. El producto se centra en un lienzo de 800 × 800 con 44 px de aire, sobre el mismo
   color de fondo que traía la foto (gris claro; negro en Creatina Micronizada, que
   viene del PDF y no del render web).
3. Se guarda en `.jpg` a calidad 88 → entre 37 y 75 KB por archivo.

No se ha retocado ni reconstruido ninguna etiqueta. Varias referencias comparten
render porque el distribuidor da una foto genérica por formato: los 5 sabores de
Harina de Avena, los 2 de BCAA, y 1 kg / 2 kg de Whey e Isolate.

Los PNG originales **no se publican**: `netlify.toml` borra
`sources/01_PNG_MAX_CALIDAD_CON_PVP` de la copia desplegada (8 MB que el sitio no
necesita). Los archivos locales no se tocan.
