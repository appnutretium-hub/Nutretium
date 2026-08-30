# TODO

Pendientes de la web. Lo del TPV y el pase a real va aparte, en
`PRUEBAS_REDSYS.md`.

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

## 2. La radio y el botón de dejar reseña no responden

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

## 3. Stock de los 22 productos de almacén

Siguen agotados porque no se sabe la cifra real: 12 helados Protzen, aguas
Aquadeus y Solares, los packs, el pastillero y la Proteína Isolate Strawberry
1 kg (`00290`).

Cuando se sepan, van en `sources/_stock/STOCK.csv` y se aplican con
`npm run stock -- --aplicar`. Detalle en `sources/_stock/LEEME.md`.

---

## 4. Fotos de producto

149 productos sin foto. La lista está en
`sources/productos/FOTOS_PENDIENTES.md`, partida en dos: 96 que hay que pedir a
los distribuidores y 53 que hay que fotografiar en la tienda. Para incorporarlas,
`sources/_nuevas/LEEME.md`.

Es el bloqueante probable para el pase a real (ver `PRUEBAS_REDSYS.md`, § 6).
