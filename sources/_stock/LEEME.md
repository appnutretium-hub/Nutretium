# Stock — se lleva desde este CSV

`STOCK.csv` es **la fuente del stock de la tienda**. Se edita en Excel, se pasa
el script, y la web se entera. No hay que tocar `products-data.js` a mano.

## El día a día

**1.** Abre `STOCK.csv` en Excel y cambia la columna `stock`.

**2.** Guarda **como CSV** (no como `.xlsx`), en la misma ruta.

**3.** Ensayo — enseña qué cambiaría, sin tocar nada:

```bash
npm run stock
```

**4.** Si el resumen cuadra, aplícalo:

```bash
npm run stock -- --aplicar
```

**5.** Sube los cambios. El stock viaja dentro de `products-data.js`, así que
**hasta que no despliegues, la web sigue enseñando lo anterior.**

## Qué se puede poner en la columna `stock`

| Valor | Qué significa |
|---|---|
| `12` | quedan 12 unidades; a la 13ª el carrito no deja seguir |
| `0` | agotado: la ficha sale con el sello «Agotado» y no se puede comprar |
| `siempre` | **no se controla stock**: siempre disponible |
| *(celda vacía)* | no tocar este producto, dejarlo como está |

`siempre` es para lo que se prepara al momento — los bowls, los cafés, los
smoothies, los waffles, los yogures Daily, los iced. Un espresso no se agota, se
hace. Ahora mismo hay **52 productos** así marcados.

## Cosas que conviene saber

**No hace falta que el CSV lleve los 179 productos.** Si solo cambian cuatro,
puedes pasar un CSV de cuatro filas: lo que no venga se queda como estaba. Al
final del ensayo te dice cuántos no venían.

**Los negativos se publican como 0.** El ERP saca stock negativo cuando se ha
vendido algo sin dar la entrada. Para la web un negativo y un cero son lo mismo
(agotado), así que se normaliza y te avisa. Un negativo en el ERP es señal de
que ese producto se está vendiendo sin registrar: merece un vistazo.

**Si algo del CSV no se entiende, no se aplica NADA.** Un código que no existe,
una letra donde va un número, un producto repetido: se lista el problema y se
para. Es a propósito — mejor no actualizar que actualizar a medias.

**El separador es `;`**, que es el que usa el Excel en español. La primera fila
es la cabecera y manda: solo se miran las columnas `codigo` y `stock`, así que
puedes dejar las demás o añadir las que quieras.

## Rehacer el CSV desde el catálogo

Si el CSV se pierde o se desordena, se puede volver a sacar del catálogo:

```bash
npm run stock -- --exportar --forzar
```

Hace falta `--forzar` porque el CSV es donde está el trabajo del día y no se
pisa por descuido.

## Si se regenera el catálogo desde un listado nuevo del ERP

`products-data.js` se reconstruye desde el PDF oficial, y ese PDF trae su propia
columna de stock: al regenerar, los 52 marcados como `siempre` volverían a 0.
**Después de regenerar, hay que volver a pasar el CSV:**

```bash
npm run stock -- --aplicar
```

Está anotado como excepción en `AUDITORIA_CATALOGO.md`.
