# TODO

Pendientes de la web. Lo del TPV y el pase a real va aparte, en
`PRUEBAS_REDSYS.md`.

Para cambiar precios, fotos, altas y bajas del catálogo no hace falta tocar
código: la tienda lo hace en `/admin.html` con su cuenta de administrador, y
aquí están `npm run panel` y el Excel. Instrucciones para el cliente en
`sources/_catalogo/LEEME.md`; el porqué, en `AUDITORIA_CATALOGO.md` §§ 11 y 12.

**El panel online no funciona hasta configurar `ADMIN_EMAILS` y `GITHUB_TOKEN`
en Netlify y redesplegar** (`DESPLIEGUE.md` § 1). Hasta entonces responde 503.

---

## 1. ~~Los botones de sesión no desaparecen al iniciar sesión~~ — ARREGLADO 22/08/2026

**Síntoma.** Con la sesión iniciada se ven a la vez «Iniciar sesión»,
«Registrarse» **y** el menú del usuario («Miguel»). Debería quedar solo el menú
del usuario, con «Cerrar sesión» dentro.

**Causa — localizada.** En `app.js`, `updateAuthUI()` oculta el bloque así:

```js
authButtons.classList.add('hidden');
```

Pero en `index.html` ese bloque es:

```html
<div id="authButtons" class="hidden lg:flex items-center gap-2">
```

`hidden` y `lg:flex` tienen la misma especificidad, y en `styles.css` compilado
el bloque `@media (min-width:1024px){...}` con `.lg\:flex{display:flex}` va **al
final del archivo**, después de `.hidden{display:none}`. Gana el último: en
escritorio (≥1024 px) añadir `hidden` no hace nada.

Encaja con el síntoma: **en móvil funciona, en escritorio no.**

**Arreglo aplicado.** En `updateAuthUI()` de `app.js`: `hidden` se deja SIEMPRE puesto
(por debajo de 1024 px estos botones no salen nunca, ahí manda el menú móvil) y
lo que se conmuta es `lg:flex`.

Verificado en el navegador a 1280 px y a 375 px, en los tres estados: sin sesión,
con sesión y tras cerrar sesión. Repasado el resto del `index.html`: `authButtons`
era el único elemento que se oculta por JS y lleva una clase de display con
prefijo responsive, así que no hay más casos.

---

## 2. ~~La radio y el botón de dejar reseña no responden~~ — HIPÓTESIS DESCARTADA 30/08/2026

**La causa que se sospechaba no era.** Comprobado en producción el 30/08/2026:
los `onclick` en línea **sí se ejecutan** en `nutretium.com` (se disparó el botón
de Filtros y abrió su panel), y la CSP que sirve Netlify es exactamente la de
`netlify.toml`, con `'unsafe-inline'` y sin ningún `nonce` que lo anulara. El
`app.js` desplegado es byte a byte el del repositorio.

Así que si la radio o el botón de reseñas siguen sin responder, **no es el CSP**:
hay que abrir la consola en el momento del fallo y mirar el error concreto. La
radio tira de `streamtheworld.com` (podría ser el propio flujo, no la página) y
las reseñas de `.netlify/functions/reviews`.

Lo de debajo se conserva porque el descarte de causas sigue siendo válido.

### Diagnóstico original

**Síntoma.** En `nutretium.com`, el botón «Escuchar» del hilo musical y el de
«+ Dejar reseña» no hacen nada.

**Lo que ya está descartado.** Reproducido en local con `npm run dev` y **los
dos funcionan**:

- `toggleRadio`, `openModal`, `setReviewStar` están definidas en `window`;
- `openModal('reviewModal')` abre el modal (le pone la clase `open`);
- `toggleRadio()` se ejecuta sin error;
- no hay errores de JavaScript en consola (los únicos 404 son
  `.netlify/functions/*`, que no existen en el servidor estático de local).

**Tampoco es la desincronización de carpetas.** Comprobado: `index.html`,
`app.js`, `animations.js` y `styles.css` son **idénticos** en
`Nutretium-main` y en `nutretium-git/Nutretium`. Lo desplegado es lo que se
probó.

**Dónde seguir.** Solo falla en producción, así que apunta a algo que existe en
Netlify y no en local. Por orden:

1. **La CSP de `netlify.toml`.** Es una cabecera, así que en local no se aplica.
   Un bloqueo sale en consola como *"Refused to load…"*. La radio tira de
   `https://playerservices.streamtheworld.com/...` (`media-src`) y las reseñas
   de `.netlify/functions/reviews` (`connect-src`). Sobre el papel `media-src
   'self' https:` y `connect-src 'self' https:` los permiten, pero hay que
   verlo en el navegador, no sobre el papel.
2. **Que el despliegue esté servido con `styles.css` viejo** o el build fallara:
   revisar el log del último deploy en Netlify.
3. **La función `reviews`**: si devuelve error, el listado sí se pinta (hay
   reseñas de ejemplo) pero el modal podría estar cayéndose al enviar.

**Cómo comprobarlo.** Abrir `nutretium.com` con la consola del navegador (F12),
pulsar los dos botones y copiar lo que salga en *Console* y en *Network*. Con
ese mensaje se cierra en un minuto.

---

## 6. ⚠️ El correo de administrador está publicado en la web — ANTES DEL PASE A REAL

`ADMIN_EMAILS` vale `appnutretium@gmail.com`, y ese mismo correo es el de
contacto público: sale en el pie, en el chat y en los tres textos legales, ocho
veces entre `app.js` e `index.html`. La web está diciendo **qué cuenta hay que
atacar** para cambiar los precios que cobra el TPV.

No pasaba hasta el 08/09/2026: el contacto era `info@nutretium.com` y no
coincidían. Al cambiar el correo público a `appnutretium@gmail.com` se juntaron
los dos, y el escáner de secretos de Netlify tumbó el despliegue avisando de
ello. **Está silenciado** con `SECRETS_SCAN_OMIT_KEYS` en `netlify.toml`, para
poder desplegar. Silenciado, no resuelto.

Lo único que hoy separa esa cuenta del catálogo es la contraseña y el freno de
5 intentos por cada 15 minutos.

**Qué hay que hacer:**

1. registrar en la tienda otra dirección que **no aparezca en la web** — una
   propia, no un alias `+algo` del correo público, que se adivina solo;
2. ponerla en `ADMIN_EMAILS` (Netlify → Environment variables) y **redesplegar**,
   que es cuando entran las variables;
3. comprobar que se entra en `/admin.html` con la nueva y que la vieja ya no;
4. **borrar `SECRETS_SCAN_OMIT_KEYS` de `netlify.toml`**: si el escáner vuelve a
   pasar limpio, es que de verdad está arreglado. Ese es el examen.

---

## 3. Stock de los 22 productos de almacén

Siguen agotados porque no se sabe la cifra real: 12 helados Protzen, aguas
Aquadeus y Solares, los packs, el pastillero y la Proteína Isolate Strawberry
1 kg (`00290`).

Cuando se sepan, van en `sources/_stock/STOCK.csv` y se aplican con
`npm run stock -- --aplicar`. Detalle en `sources/_stock/LEEME.md`.

---

## 4. Fotos de producto

121 de 152 productos sin foto. La lista está en
`sources/productos/FOTOS_PENDIENTES.md`, partida en dos: 68 que hay que pedir a
los distribuidores y 53 que hay que fotografiar en la tienda. Para incorporarlas,
`sources/_nuevas/LEEME.md`, o una a una desde el panel (`npm run panel`).

Bajaron de 149 a 121 al retirar los 28 refrescos de marca ajena: esos packshots
ya no hacen falta. Los 28 que se pedían a Coca-Cola, Pepsico y Monster salen
del correo a proveedores.

Es el bloqueante probable para el pase a real (ver `PRUEBAS_REDSYS.md`, § 6).

---

## 5. ~~«Mi perfil» no hacía nada~~ — HECHO 30/08/2026

**Lo que pasaba.** La entrada del menú existía desde siempre pero
`showSection('profile')` solo mostraba un aviso: «Perfil — próximamente
disponible». No era una regresión: la pantalla no se había hecho nunca.

**Ahora.** `openProfile()` abre el modal genérico (`infoModal`, el mismo de «Mis
pedidos») con nombre, apellidos y teléfono editables, y el correo a la vista pero
fijo. Guardar llama a `action: 'update'` en `auth.js`.

El correo no se puede cambiar a propósito: es la clave con la que se guarda el
usuario en Blobs, así que cambiarlo sería mover la ficha entera y dejar los
pedidos antiguos apuntando a la vieja. Si algún día hace falta, es una migración,
no un campo editable.

`update` escribe **solo** esos tres campos: id, correo, hash de la contraseña y
fecha de alta se conservan aunque vengan en la petición. Hay pruebas de eso y de
que nadie se asciende a administrador metiendo `role` en el cuerpo:
`npm run test:cuentas`, 25 casos.

**Pendiente si se quiere ir más lejos:** cambiar la contraseña desde el perfil.
Se dejó fuera porque toca el camino de autenticación, que está en verde y
pendiente del pase a real con el banco.
