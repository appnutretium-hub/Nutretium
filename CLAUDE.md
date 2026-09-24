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
productos tengan foto. Van **77 de los 80 publicados** (84 de 152 contando los
no publicados; § 6): eran 30, y subieron de golpe al
recuperar 18 fotos que estaban subidas pero que el catálogo había dejado de
apuntar — ver «La ruta de la foto la calcula el servidor».

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
| `npm run test:redsys` | el TPV por dentro, sin tocar el banco — 24 casos |
| `npm run test:catalogo` | la hoja de catálogo: lo que NO deja publicar — 43 casos |
| `npm run test:admin` | el panel online: quién entra y qué se sube — 44 casos |
| `npm run test:cuentas` | cuentas: rol, ficha, dirección y freno al login — 46 casos |
| `npm run dev` | servidor estático en `localhost:4173` (sin funciones: los `/.netlify/functions/*` dan 404, es normal) |
| `npm run build:css` | recompila `styles.css` con Tailwind |
| `npm run stock` | actualiza el stock desde CSV (ensayo; `-- --aplicar` para escribir) |
| `npm run fotos` | incorpora fotos nuevas del buzón (ensayo; `-- --aplicar` para escribir) |
| `npm run catalogo` | precios, altas, bajas y fotos desde CSV (ensayo; `-- --aplicar` para escribir) |
| `npm run panel` | lo mismo pero con pantalla, en `localhost:4180` |
| `npm run ia:reparar` | IA local (Ollama) que pasa las pruebas y repara lo que falla durante horas (ensayo; `-- --aplicar` para escribir) |
| `npm run ia:estado` | cómo va la IA reparadora y qué parches lleva |
| `npm run ia:probar` | todas las pruebas de una vez; `-- 0007` prueba solo ese parche y sus criterios |
| `npm run test:ia` | la IA reparadora con un Ollama falso: lo que NO deja cambiar y las 7 etapas — 92 casos |

`stock`, `fotos` y `catalogo` **no escriben nada sin `--aplicar`**: enseñan qué
harían y te dejan revisarlo. El panel hace lo mismo en pantalla: antes de
guardar enseña la lista de altas, bajas y cambios y pide confirmación. Mantén
esa costumbre si añades más herramientas de estas.

## IA reparadora (`npm run ia:reparar`)

`scripts/ia-reparador.js` es solo la línea de comandos; el trabajo está en
`scripts/ia/` (un módulo por responsabilidad, ninguno pasa de 300 líneas —
`npm run test:ia` lo comprueba). Pone al Ollama del equipo a pasar las pruebas
y reparar lo que falla durante horas; con todo en verde revisa archivos y
apunta posibles errores. Guía para el cliente: `docs/IA-REPARADORA.md`.

**Cada caso que falla es un tiquet que recorre siete etapas**
(`scripts/ia/flujo.js`, una etapa por archivo en `scripts/ia/etapas/`):
1 tiquet enriquecido → 2 plan en .md con **mapa de criterios de aceptación** →
3 implementación → 4 revisión de código → 5 QA → 6 release → 7 address-review.
Cada etapa deja su documento numerado en `.ia-reparador/tiquets/<suite>-<clave>/`.
Los criterios CA-1 a CA-6 son fijos y los comprueba una máquina
(`scripts/ia/criterios.js`); los del plan, la revisión. Bloqueantes de la
revisión vuelven a la 3; sugerencias van a la 7 como parche aparte con
`depende`, que no puede deshacerse el principal mientras esté aplicado.

La regla que la sostiene: **una propuesta de la IA solo es una reparación si
hace pasar una prueba que fallaba sin romper ninguna de las verdes**, verificado
en una copia aparte (`node_modules/.cache/ia-reparador`). La revisión de código
solo puede vetar, nunca aprobar lo que QA rechaza. Lo que no respalda una
prueba (los hallazgos de la revisión de archivos) va al informe y no se aplica.
Por eso `revisaCambio()` le prohíbe tocar pruebas, `products-data.js`,
`netlify.toml`, `package.json`, su propio código, quitar comprobaciones de
seguridad o inventar secretos: si amplías lo que puede tocar, amplía también
`npm run test:ia`.

**Corrección única**: `scripts/ia/correcciones.js` guarda cada error por su
huella entre sesiones. Un error corregido que reaparece NO se corrige otra vez
(queda para una persona); lo verificado en ensayo se reutiliza con `--aplicar`
sin preguntar a la IA; una propuesta descartada no se vuelve a probar. Un
error, un tiquet, un parche (`.ia-reparador/parches/NNNN-*.json`), que se
prueba con `npm run ia:probar -- NNNN` y se deshace con `--revertir NNNN`.

Autónoma: callada por defecto (`--detalle` para ver pasos), espera a Ollama si
no está en vez de caerse, `--segundo-plano` la desengancha de la consola y
`--parar` la detiene al acabar el paso en curso (archivo `PARAR`).

Las pruebas corren con un entorno sin secretos (`entornoLimpio`), y Ollama
tiene que ser local: el código no sale del equipo. Su informe, tiquets, parches
y copias van en `.ia-reparador/` (en `.gitignore`; `prepare-dist.js` ya excluye
las carpetas que empiezan por punto).

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

### La ruta de la foto la calcula el servidor, y hay que devolvérsela

Esto costó 18 fotos. La ruta de destino la fija `hoja.rutaEsperada()` en el
servidor, a propósito (§ Fotos de producto). Pero el navegador **no puede
adivinarla**, así que si no se la mandas de vuelta, su lista se queda con la
foto vacía — y la **siguiente** publicación manda ese producto sin foto y borra
el enlace recién hecho. El `.webp` se queda en el repositorio, huérfano, y la
ficha vuelve a salir sin foto. Solo sobrevivía la última foto de cada tanda.

Por eso `admin-catalogo.js` devuelve `fotos: [{codigo, ruta}]` al publicar y
`admin.js` las escribe en su lista **antes** de clonar `original`. Si tocas ese
camino, `npm run test:admin` encadena dos publicaciones y lo comprueba.

Y no daba error porque el validador descarta una foto con un **aviso**, no con
un error, y los avisos no se enseñaban después de publicar. Ahora sí, en los dos
modos: un aviso es justo lo que NO se ha aplicado, y callarlo fue la mitad del
problema. **Si añades avisos nuevos, comprueba que se ven.**

### Cada publicación es un despliegue, y los despliegues se pagan

Quien lleva la tienda **no usa la consola**: mete las fotos por `/admin.html`.
Y el panel tenía un tope de 12 fotos por publicación, así que las subía de una
en una y publicaba cada vez. Eso son **30 despliegues para 30 fotos**, y agotó
el cupo de Netlify: la web se quedó **31 commits sin desplegar**, congelada,
mientras GitHub seguía al día. El síntoma engaña —parece que el panel no
guarda— y no lo es.

Por eso:

* el tope son **150 fotos**, no 12. El que manda de verdad es el de bytes
  (`MAX_BYTES_FOTOS`, 4 MB), porque el límite real es que Netlify corta la
  petición a 6 MB y la foto viaja en base64;
* el panel aprieta cada foto a **35 KB** (`MAX_KB` en `admin.js`) bajando la
  calidad, como ya hacía sharp. Medido con packshots reales: 18–27 KB, así que
  **las 95 que faltan entran en un solo envío** (~2,3 MB). `npm run test:admin`
  lo comprueba con las 95 de verdad;
* antes de publicar, el panel enseña cuántas van y cuánto pesan.

**Si tocas estos topes, haz la cuenta completa**: nº de fotos × KB × 1,33 del
base64 + el catálogo, y que quepa en 6 MB. Y no prometas en los comentarios que
35 KB se cumple siempre: es un objetivo, y con una imagen que no comprima
(probado con ruido: 103 KB) se manda como esté y el servidor decide.

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

**Y `CATALOGO.csv` se queda atrás también**, porque el panel online escribe
`products-data.js` y nunca el CSV. Eso convierte al Excel en una trampa
cargada: `npm run catalogo -- --aplicar` con un CSV viejo **deshace** lo
publicado desde la tienda —ya llegó a borrar 9 fotos y a dar de baja un alta—.
El ensayo lo enseña, así que **léelo**. Para ponerlo al día con el catálogo
actual antes de editarlo:

```bash
npm run catalogo -- --exportar --forzar
```

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

## Sin cuenta y sin dirección no se cobra

> **Desfase conocido (24/09/2026):** esta sección describe `redsys.js`, que es
> el cobro del carrito de `index.html` (`app.js`, `commerce-pro.js`). Pero
> `checkout.html` cobra por `checkout.js`, que **sí admite invitado** con nombre,
> correo y dirección completos (sin ellos: 401 `guest-required`). Se ha
> mantenido así a propósito para no quitar una funcionalidad en uso; unificar
> los dos caminos de cobro es una decisión pendiente, no un arreglo.

Se acabaron los pedidos de invitado. `redsys.js` comprueba **antes de valorar el
carrito y antes de firmar nada**: sin sesión responde 401 (`motivo: 'sin-sesion'`)
y sin dirección de envío completa, 422 (`motivo: 'sin-direccion'`). El `motivo`
existe para que la tienda sepa qué abrir —el registro o «Mi perfil»—, porque
enseñar el error y dejar al cliente mirando el botón no le resuelve nada.

La tienda avisa antes por comodidad, pero **esa comprobación no protege**:
`app.js` corre en el navegador y cualquiera puede llamar a la función a mano.
Quien decide es el servidor, igual que con los precios.

El carrito **no** se cierra a quien no tiene cuenta: puede llenarlo entero y se
le pide la cuenta al pulsar «Pagar». Cortarlo antes espanta a quien está
mirando, y el efecto es el mismo porque nadie llega a pagar sin cuenta.

### La dirección: un solo validador, y una copia en cada pedido

`netlify/lib/direccion.js` dice qué campos hay, cuáles son obligatorios (todos
menos el piso) y qué es un código postal válido. Lo usan **auth.js** (alta y
edición de ficha) y **redsys.js** (al cobrar). Igual que con el catálogo: un
validador por vía acabaría dejando pasar en el alta lo que el cobro rechaza.

El pedido guarda **una copia** de la dirección (`envio`), no una referencia al
usuario: si guardara la referencia, cambiar la dirección reescribiría a dónde se
mandaron los pedidos ya enviados. Y va al correo del pedido — sin eso llega
cobrado y sin saber a dónde mandarlo.

`netlify/lib/usuarios.js` es de dónde se lee la ficha. Estaba dentro de auth.js
y se sacó porque redsys.js también la necesita.

**Las cuentas anteriores no tienen dirección.** No se rompen: entran y navegan
igual, y se les pide al ir a pagar (`direccionCompleta: false` en la ficha que
devuelve auth.js). Si tocas esto, `npm run test:cuentas` y `npm run test:redsys`
cubren los dos caminos.

## Cookies: no hay ninguna de terceros, y el banner está para el día que las haya

La web no usa analítica ni publicidad. Solo guarda `nutretium_user`,
`nutretium_last_order` y `nutretium_cookies`, que son almacenamiento
estrictamente necesario y están **exentos de consentimiento** (LSSI art. 22.2).
El texto legal decía que usábamos cookies de terceros y que analizábamos el
tráfico; era falso y está reescrito.

El banner existe igualmente porque el día que se añada medición, el
consentimiento tiene que estar ANTES. **Regla: todo script de analítica o
publicidad va dentro de `aplicaConsentimiento()` en `app.js`, en la rama del sí.
Ni una línea fuera.** «Rechazar» y «Aceptar» tienen el mismo tamaño a propósito
(la AEPD no admite que rechazar cueste más), y el pie lleva «Configurar cookies»
porque retirar el consentimiento tiene que ser tan fácil como darlo.

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

77 de los 80 productos publicados tienen foto (84 de 152 en total). La lista de las que faltan, **partida por
proveedor**, se genera sola en `sources/productos/FOTOS_PENDIENTES.md` — se
rehace con `npm run fotos -- --aplicar` aunque el buzón esté vacío.

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

Se publica `dist/`, no la raíz: `npm run build` acaba en `scripts/prepare-dist.js`,
que copia **solo** lo que pasa su lista blanca (extensiones web, nada de `.md`,
`.csv`, `.pdf`, `.xlsx`, `.toml`; fuera `scripts`, `netlify`, `node_modules` y
las carpetas que empiezan por punto; de `sources/` solo imágenes). Hay además
reglas 404 como red de seguridad, incluida `/sources/_*`.

Si añades un documento interno nuevo con una extensión que la lista blanca deja
pasar (`.js`, `.html`, `.json`…), añádelo a `ROOT_FILE_DENY` o `ROOT_DENY` en
`prepare-dist.js` y a `.gitignore`.

El build **reescribe fuentes** en la raíz: `robots.txt`, `sitemap.xml`,
`pim-audit.json` y las carpetas `producto/`, `categoria/`, `marca/` y
`objetivo/` (las genera `build-seo-pages.js`), además de `app.js`, `index.html`
y `styles.css`. Por eso `robots.txt` se edita en la plantilla de
`build-seo-pages.js`, no en el archivo. Las inyecciones de
`staff-login-inject.js` ya están también en el HTML fuente (son idempotentes),
para que las pruebas no dependan de haber hecho un build antes.

**`admin.html` y `admin.js` sí se publican, y está bien.** Son el panel de la
tienda: llevan `noindex` para que no salgan en Google, pero no protegen nada por
sí mismos —quien decide quién entra es la función. No metas en ellos ninguna
clave ni ninguna lista que no pueda leer un desconocido.

**Cuidado al editar `netlify.toml` con scripts:** el comando va en una cadena
`"""` de TOML, donde `\n` es un escape real. Se han colado `\n` literales **tres
veces ya**, la última con `sed -i` (se come los backslashes). Usa Node y
construye el backslash con `String.fromCharCode(92)`, y verifica siempre después
con `grep -c -F '\n' netlify.toml` → debe dar `0`.

## Piezas añadidas el 24/09/2026 (auditoría)

* **`scripts/entorno-pruebas.js`**: las pruebas que cargan funciones lo requieren
  primero y vacían `process.env` hasta la lista de `entornoLimpio`. Sin eso,
  con las variables del sitio puestas (`COMMERCE_LIVE`, `REDSYS_ENV`…) fallaban
  pruebas que estaban bien.
* **Freno al login de verdad** (`consulta()` en `netlify/lib/rate-limit.js`): se
  mira el castigo **antes** de comprobar la contraseña. Antes, acertar durante
  los 15 minutos entraba igual. Cuenta también para las cuentas de dueño. La
  clave sigue siendo IP + correo a propósito: solo por correo, cualquiera podría
  bloquear la cuenta de otro.
* **`netlify/lib/error-publico.js`**: el cliente solo ve el mensaje de un error
  si lleva `statusCode` o un código conocido; el resto va a `console.error` y
  se responde un texto genérico. Úsalo en funciones nuevas en vez de devolver
  `err.message`.
* **`sw.js`** (caché `nutretium-shell-v3`): JS, CSS y el shell van **red
  primero** (la caché es solo para sin conexión); imágenes y fuentes, caché y
  refresco en segundo plano. Con caché primero, un despliegue no llegaba a quien
  ya había entrado. Si cambias la estrategia, sube la versión.
* **Fotos**: `/sources/productos/*` ya no es `immutable` (un día +
  `stale-while-revalidate`), porque el panel sustituye la foto en la misma ruta.

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
