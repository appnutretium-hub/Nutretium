# NUTRETIUM — orientación del proyecto

Tienda online de nutrición deportiva. HTML + JS sin framework, servida por
Netlify, con funciones serverless para pagos (Redsys), sesiones y pedidos.

## ⚠️ Tarea en curso: pruebas del TPV y respuesta al banco

**Lee `PRUEBAS_REDSYS.md` antes de cualquier otra cosa si retomas esto.**
`TODO.md` lleva los pendientes de la web que no son del TPV.

CaixaBank/Redsys ha dado de alta el TPV en entorno de pruebas (comercio
`369551841`) y espera dos correos nuestros: uno indicando plataforma y tipo de
integración (borrador listo, § 9.1) y otro solicitando el pase a real cuando las
pruebas pasen (§ 9.2).

**Por dentro la integración está comprobada.** `npm run test:redsys` son 19
comprobaciones en verde: la firma HMAC-SHA256v1 se reproduce con una
implementación independiente del algoritmo, el nº de pedido cumple el formato,
se falla cerrado sin credenciales, y una notificación manipulada se rechaza con
403. Ejecútalo antes de tocar la pasarela; ver § 5.0.

**Lo que bloquea ahora no es código, es configuración del cliente** (§ 5.1):

1. el sitio estaba **en pausa** en Netlify — sin despausar no se despliega nada;
2. faltan variables de entorno, y **hay que redesplegar** después porque solo se
   aplican en despliegues nuevos;
3. `redsys-notify` tiene que ser alcanzable desde fuera: un GET debe dar 405, no
   404. Si Redsys no llega, el pago se cobra y el pedido nunca pasa a `PAID`.

**Bloqueante aparte para el pase a real:** el banco exige que la mayoría de
productos tengan foto y solo 30 de 179 la tienen (§ 6).

## Dos carpetas, y se han desincronizado ya una vez

| | |
|---|---|
| `C:\Users\vnzla\Downloads\Nutretium-main` | carpeta de trabajo |
| `C:\Users\vnzla\Downloads\nutretium-git\Nutretium` | **repositorio real**, es lo que despliega |

Se sincronizan copiando a mano. Copiar **no borra** los archivos eliminados: eso
necesita `git rm` en la carpeta del repo. Nunca des por hecho que están
iguales: compruébalo antes y después de copiar. Desde Git Bash:

```bash
diff -rq --exclude=node_modules --exclude=.git "/c/Users/vnzla/Downloads/Nutretium-main" "/c/Users/vnzla/Downloads/nutretium-git/Nutretium"
```

Sin salida = idénticas. `Files … differ` = falta copiar. `Only in …-main` =
archivo nuevo sin copiar. `Only in nutretium-git` = archivo que se borró aquí y
sigue allí: ese necesita `git rm`.

GitHub: `appnutretium-hub/Nutretium`, rama `main` → despliega solo en Netlify
(proyecto `nutretium`, dominio `nutretium.com`).

El usuario ejecuta los comandos de git él mismo y **usa PowerShell**, no cmd:
nada de `cd /d`.

## Comandos

| | |
|---|---|
| `npm test` | precios y carrito — 18 casos, incluidos intentos de manipular el importe |
| `npm run test:redsys` | el TPV por dentro, sin tocar el banco — 19 casos |
| `npm run test:catalogo` | la hoja de catálogo: lo que NO deja publicar — 43 casos |
| `npm run test:admin` | el panel online: quién entra y qué se sube — 42 casos |
| `npm run test:cuentas` | cuentas de cliente: rol, ficha y freno al login — 25 casos |
| `npm run dev` | servidor estático en `localhost:4173` (sin funciones: los `/.netlify/functions/*` dan 404, es normal) |
| `npm run build:css` | recompila `styles.css` con Tailwind |
| `npm run stock` | actualiza el stock desde CSV (ensayo; `-- --aplicar` para escribir) |
| `npm run fotos` | incorpora fotos nuevas del buzón (ensayo; `-- --aplicar` para escribir) |
| `npm run catalogo` | precios, altas, bajas y fotos desde CSV (ensayo; `-- --aplicar` para escribir) |
| `npm run panel` | lo mismo pero con pantalla, en `localhost:4180` |

`stock`, `fotos` y `catalogo` **no escriben nada sin `--aplicar`**: enseñan qué
harían y te dejan revisarlo. El panel hace lo mismo en pantalla: antes de
guardar enseña la lista de altas, bajas y cambios y pide confirmación. Mantén
esa costumbre si añades más herramientas de estas.

## Reglas del catálogo

`products-data.js` es la **única** lista de productos, y la cargan tanto el
navegador (`window.NUTRETIUM_PRODUCTS`) como las funciones de Netlify
(`require`). No crear una segunda lista: ya hubo dos y provocaba que la web
enseñara precios que el servidor no reconocía al cobrar.

Se generó desde el listado oficial del ERP y **no se edita a mano**: cada campo
tiene su herramienta. Las reglas y el histórico están en `AUDITORIA_CATALOGO.md`.

### Precios, altas, bajas y fotos salen de un CSV

`sources/_catalogo/CATALOGO.csv` es la hoja de trabajo (una fila por producto:
código, nombre, categoría, precio, stock, publicado, destacado, etiqueta, marca,
foto) y `scripts/catalogo-actualizar.js` la vuelca a `products-data.js`.

Hay **tres vías de edición y un solo validador**
(`netlify/lib/catalogo-hoja.js`): Excel, el panel local y el panel online
aceptan y rechazan exactamente lo mismo. No metas comprobaciones en ninguna de
las tres por separado — un validador por vía es la misma trampa que fueron las
dos listas de productos.

### El panel: una página, dos transportes

`admin.html` + `admin.js` son la MISMA página en los dos sitios. Lo único que
cambia es a quién le habla, y lo decide `MODO` en `admin.js` mirando el puerto:

| | |
|---|---|
| `/admin.html` en la tienda | habla con `netlify/functions/admin-catalogo.js`; publica haciendo un commit |
| `npm run panel` (`:4180`) | habla con `scripts/panel-servidor.js`; escribe los archivos y publicar es un `git push` tuyo |

El panel local escucha solo en 127.0.0.1 y no tiene contraseña porque no está
expuesto. El de la tienda sí: ver más abajo.

### Publicar desde la tienda es un commit, no un almacén

Una función de Netlify **no puede escribir en `products-data.js`**: el sistema
de archivos es de solo lectura y efímero. La alternativa fácil —guardar el
catálogo en Blobs y leerlo en caliente— sería una segunda fuente de precios,
justo lo prohibido. Así que `netlify/lib/github.js` hace un commit a la rama y
Netlify despliega solo: `products-data.js` sigue siendo la única lista, el
camino del cobro no se toca, y cada cambio queda en el historial con vuelta
atrás. A cambio, publicar tarda lo que tarde el despliegue.

El catálogo que edita el panel online **se lee de GitHub**, no del paquete de la
función: esa copia es la del despliegue en curso y estaría atrasada justo
después de publicar. Se parsea, no se ejecuta (`hoja.parsea`).

Catálogo y fotos van en **un solo commit**. Si fueran por separado habría un
despliegue intermedio con la ficha apuntando a una foto que aún no existe.

### Quién es administrador lo dice una variable de entorno

`ADMIN_EMAILS`, en Netlify. **No un campo `role` en la ficha del usuario**: los
usuarios viven en Blobs, y con el rol ahí, quien consiguiera escribir en ese
almacén se ascendería y podría cambiar los precios que cobra el TPV. El
registro nunca acepta un rol del cliente: se calcula siempre (`rolDe`).

La ficha del cliente se edita con `action: 'update'` en `auth.js`, y esa acción
escribe **solo** nombre, apellidos y teléfono: el correo, el id, el hash de la
contraseña y la fecha de alta se conservan vengan como vengan en la petición. El
correo no se puede cambiar porque es la clave con la que se guarda el usuario en
Blobs: cambiarlo sería mover la ficha y dejar los pedidos apuntando a la vieja.

Sin `ADMIN_EMAILS` el panel está cerrado para todos (503), como el resto de
credenciales del proyecto. `netlify/lib/admin.js` lo comprueba en **todas** las
acciones, incluidas las de solo lectura: `admin.html` es un archivo estático
que cualquiera puede descargar y no protege nada.

Como consecuencia de tener el catálogo editable desde internet:

* el login lleva **freno a la fuerza bruta** (5 fallos por correo → 15 minutos
  de espera, contados en Blobs y también para correos que no existen, para no
  revelar cuáles están registrados);
* el validador **rechaza `<` y `>`** en nombre, marca y etiqueta. Esos textos se
  pintan con `innerHTML` en `app.js`: sin eso, una cuenta de administrador
  comprometida sería JavaScript ejecutándose en la página del carrito.

### La carpeta de trabajo se queda atrás cuando la tienda publica

Al problema de las dos carpetas se le suma una dirección nueva: si la tienda
publica desde `/admin.html`, el **repositorio se adelanta**. Antes de tocar el
catálogo en local hay que hacer `git pull` en la carpeta del repo y traerse
`products-data.js` y `sources/productos/`. Está escrito para el cliente en
`sources/_catalogo/LEEME.md`.

### Nada de esto se aplica hasta configurar Netlify

El panel online necesita `ADMIN_EMAILS` y `GITHUB_TOKEN` (fine-grained, solo
*Contents: read and write* sobre `appnutretium-hub/Nutretium`), y las variables
solo entran en despliegues nuevos. Sin ellas responde 503 con un mensaje que lo
dice. Detalle en `.env.example` y `DESPLIEGUE.md`.
### `active: false` oculta, y tiene que ocultar en los dos lados

Es el interruptor «Publicado» del panel. `netlify/lib/catalogo.js` rechaza al
cobrar los productos con `active: false`, y `app.js` los filtra al cargar. Si
tocas uno, toca el otro — antes solo lo hacía el servidor y se podían meter en
el carrito productos que el pago rechazaba.

### La lista de no vendibles: bajas que no vuelven solas

`netlify/lib/no-vendibles.js` lista los códigos que no se publican nunca,
con su motivo. Ahí están los 28 refrescos y energéticas de marca ajena
(Coca-cola, Fanta, Kas, Monster, Red Bull…) retirados el 30/08/2026. Existe
porque una baja hecha solo borrando la fila volvería en cuanto alguien regenere
el catálogo desde el listado del ERP, que sí los trae.

### El stock ya NO sale del PDF: sale de un CSV

`sources/_stock/STOCK.csv` es la fuente del stock, y se aplica con
`npm run stock -- --aplicar` (`scripts/stock-actualizar.js`). Sigue
escribiéndose dentro de `products-data.js` a propósito: una segunda fuente
consultada aparte reabriría el problema de arriba.

**`stock: null` significa «no se controla stock», y es disponible siempre.** Lo
llevan 52 productos que se preparan al momento (bowls, cafés, smoothies,
waffles, yogures, iced): el ERP nunca les da entrada de almacén, así que su
contador solo bajaba y salían todos agotados. Tanto `inStock()` en `app.js`
como `hayStock()` en `netlify/lib/catalogo.js` tratan `null` como disponible —
si tocas uno, toca el otro.

**Si regeneras el catálogo desde un listado nuevo del ERP, el PDF trae su propia
columna de stock y esos 52 vuelven a 0.** Después de regenerar hay que volver a
pasar el CSV. Detalle en `AUDITORIA_CATALOGO.md` § 10.

## El precio lo pone el servidor, nunca el navegador

`netlify/lib/catalogo.js` valora el carrito. La petición de pago solo dice qué
producto (`id` + `code`) y cuántas unidades; importe, nombre y total salen del
catálogo, en céntimos enteros. Si el `amount` que manda el navegador no cuadra,
`redsys.js` responde 409 y no firma nada.

El `code` viaja junto al `id` a propósito: es el seguro contra que el navegador
use otra lista de productos donde el id 3 no sea el id 3 del servidor.

**Ejecuta `npm test` siempre que toques precios o el carrito**,
`npm run test:redsys` si tocas la pasarela o la notificación,
`npm run test:catalogo` si tocas el validador o las vías de edición,
`npm run test:admin` si tocas el panel online, el rol de administrador o el
commit a GitHub, y `npm run test:cuentas` si tocas `auth.js`.

## Secretos: se falla cerrado, no se inventan valores por defecto

Sin `JWT_SECRET` (mínimo 32 caracteres) el registro y el login devuelven 503, a
propósito. Antes había un secreto por defecto escrito en el código que permitía
falsificar sesiones. **No reintroduzcas valores por defecto para credenciales.**

Lo mismo en el TPV: sin `REDSYS_SECRET_KEY` no se firma nada, y `redsys-notify`
no da por buena ninguna notificación. Hay pruebas que lo comprueban.

Y lo mismo en el panel de catálogo: sin `ADMIN_EMAILS` no hay administradores y
sin `GITHUB_TOKEN` no se publica. Los dos responden 503 diciendo qué falta.

Variables de entorno y qué se rompe si falta cada una: `.env.example` y
`DESPLIEGUE.md`.

## Fotos de producto

30 de 151 productos tienen foto. La lista de las que faltan, **partida por
proveedor**, se genera sola en `sources/productos/FOTOS_PENDIENTES.md`.

Para incorporar fotos nuevas: se sueltan en `sources/_nuevas/` y `npm run fotos`
las recorta, las centra en 800 × 800, las guarda en `.webp` y las enlaza. Las
instrucciones para el cliente están en `sources/_nuevas/LEEME.md`.

Los dos paneles también admiten fotos de una en una: ahí el encuadre lo hace el
navegador con `canvas` (mismo lienzo de 800 × 800 y mismo `.webp`), porque el
panel online corre dentro de una función y no hay dónde procesar imágenes. La
diferencia con `npm run fotos` es que sharp además **recorta el borde sobrante**
del original antes de encuadrar, así que para tandas grandes sigue siendo mejor
el buzón. La ruta de destino la calcula siempre el servidor con
`hoja.rutaEsperada()`, para que caiga donde la busca `NOMBRES_ESPERADOS.csv`.

**No intentes sacarlas de internet automáticamente: ya se probó y no vale**
(`PRUEBAS_REDSYS.md` § 6.1). Las fuentes con licencia de uso tienen fotos de
aficionado —peores que el emoji— y el emparejamiento por nombre se equivoca de
producto, que es peor que no tener foto. Las dos vías que sí funcionan son
pedirle el packshot al distribuidor (96 productos) y fotografiar en la tienda
los 53 que son recetas de la casa y no existen en internet.

## Nada interno se publica

`publish = "."` sirve la carpeta entera, así que el comando de build de
`netlify.toml` borra de la copia desplegada el listado del ERP en PDF, el Excel,
la auditoría, el TODO, los backups, `scripts` (donde vive el panel), y las
carpetas de trabajo `sources/_stock`, `sources/_nuevas` y `sources/_catalogo`.
Hay además reglas 404 como red de seguridad, incluida `/sources/_*`.

Si añades un documento interno nuevo, mételo en las tres listas: el `rm -rf` del
build, `.gitignore`, y comprueba que el toml sigue parseando.

**`admin.html` y `admin.js` sí se publican, y está bien.** Son el panel de la
tienda: llevan `noindex` para que no salgan en Google, pero no protegen nada por
sí mismos —quien decide quién entra es la función. No metas en ellos ninguna
clave ni ninguna lista que no pueda leer un desconocido.

**Cuidado al editar `netlify.toml` con scripts:** el comando va en una cadena
`"""` de TOML, donde `\n` es un escape real. Se han colado `\n` literales **tres
veces ya**, la última con `sed -i` (se come los backslashes). Usa Node y
construye el backslash con `String.fromCharCode(92)`, y verifica siempre después
con `grep -c -F '\n' netlify.toml` → debe dar `0`.

## CSS

Tailwind va **compilado**, no por CDN: `npm run build:css` genera `styles.css`
(28 KB) leyendo `tailwind.config.js`. Si añades clases de Tailwind en
`index.html`, `app.js` o `products-data.js`, recompila o no existirán.

**Ojo con ocultar por JS elementos que lleven un display con prefijo
responsive.** `class="hidden lg:flex"` + `classList.add('hidden')` **no oculta
nada** a partir de 1024 px: en el CSS compilado el bloque `@media` de `lg` va al
final del archivo, después de `.hidden`, y con la misma especificidad gana el
último. Fue el bug de los botones de sesión (`TODO.md` § 1). La solución es
dejar `hidden` puesto y conmutar el `lg:flex`, no al revés — y recuerda que ese
`hidden` suele estar ahí también para ocultarlo en móvil, así que quitarlo
rompe el móvil.

## Estilo

Todo el material que ve el usuario va **en castellano**: comentarios de código
nuevo, documentación y mensajes de la interfaz.
