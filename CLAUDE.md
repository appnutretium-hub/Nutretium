# NUTRETIUM — orientación del proyecto

Tienda online de nutrición deportiva. HTML + JS sin framework, servida por
Netlify, con funciones serverless para pagos (Redsys), sesiones y pedidos.

## ⚠️ Tarea en curso: pruebas del TPV y respuesta al banco

**Lee `PRUEBAS_REDSYS.md` antes de cualquier otra cosa si retomas esto.**

CaixaBank/Redsys ha dado de alta el TPV en entorno de pruebas (comercio
`369551841`) y espera dos correos nuestros: uno indicando plataforma y tipo de
integración, y otro solicitando el pase a real cuando las pruebas pasen.
`PRUEBAS_REDSYS.md` tiene el plan de pruebas, las tarjetas de test, los
borradores de ambos correos y **un bloqueante detectado** (solo 30 de 179
productos tienen foto, y el banco exige que la mayoría las tenga).

## Dos carpetas, y se han desincronizado ya una vez

| | |
|---|---|
| `C:\Users\vnzla\Downloads\Nutretium-main` | carpeta de trabajo |
| `C:\Users\vnzla\Downloads\nutretium-git\Nutretium` | **repositorio real**, es lo que despliega |

Se sincronizan copiando a mano. Copiar **no borra** los archivos eliminados: eso
necesita `git rm` en la carpeta del repo. Comprueba con `diff` antes de dar por
hecho que están iguales.

GitHub: `appnutretium-hub/Nutretium`, rama `main` → despliega solo en Netlify
(proyecto `nutretium`, dominio `nutretium.com`).

El usuario ejecuta los comandos de git él mismo y **usa PowerShell**, no cmd:
nada de `cd /d`.

## Reglas del catálogo

`products-data.js` es la **única** lista de productos, y la cargan tanto el
navegador (`window.NUTRETIUM_PRODUCTS`) como las funciones de Netlify
(`require`). No crear una segunda lista: ya hubo dos y provocaba que la web
enseñara precios que el servidor no reconocía al cobrar.

Se genera desde el listado oficial del ERP; no se edita a mano salvo excepciones
documentadas. Las reglas y el histórico de cambios están en
`AUDITORIA_CATALOGO.md`.

## El precio lo pone el servidor, nunca el navegador

`netlify/lib/catalogo.js` valora el carrito. La petición de pago solo dice qué
producto (`id` + `code`) y cuántas unidades; importe, nombre y total salen del
catálogo, en céntimos enteros. Si el `amount` que manda el navegador no cuadra,
`redsys.js` responde 409 y no firma nada.

El `code` viaja junto al `id` a propósito: es el seguro contra que el navegador
use otra lista de productos donde el id 3 no sea el id 3 del servidor.

Pruebas: `npm test` (`scripts/test-precios.js`, 18 casos incluyendo intentos de
manipulación del importe). **Ejecútalas siempre que toques precios o el carrito.**

## Secretos: se falla cerrado, no se inventan valores por defecto

Sin `JWT_SECRET` (mínimo 32 caracteres) el registro y el login devuelven 503, a
propósito. Antes había un secreto por defecto escrito en el código que permitía
falsificar sesiones. **No reintroduzcas valores por defecto para credenciales.**

Variables de entorno y qué se rompe si falta cada una: `.env.example` y
`DESPLIEGUE.md`.

## Nada interno se publica

`publish = "."` sirve la carpeta entera, así que el comando de build de
`netlify.toml` borra de la copia desplegada el listado del ERP en PDF, el Excel,
la auditoría, los backups y los originales de las fotos. Hay además reglas 404
como red de seguridad.

Si añades un documento interno nuevo, mételo en las tres listas: el `rm -rf` del
build, `.gitignore`, y comprueba que el toml sigue parseando.

**Cuidado al editar `netlify.toml` con scripts:** el comando va en una cadena
`"""` de TOML, donde `\n` es un escape real. Se han colado `\n` literales dos
veces y eso rompe el shell. Verifica con `grep -c -F '\n' netlify.toml` → debe
dar `0`.

## CSS

Tailwind va **compilado**, no por CDN: `npm run build:css` genera `styles.css`
(28 KB) leyendo `tailwind.config.js`. Si añades clases de Tailwind en
`index.html`, `app.js` o `products-data.js`, recompila o no existirán.

## Estilo

Todo el material que ve el usuario va **en castellano**: comentarios de código
nuevo, documentación y mensajes de la interfaz.
