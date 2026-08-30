# Cómo actualizar el catálogo de la tienda

Aquí se cambian **precios, fotos, qué productos hay y cuáles se publican**.
No hace falta saber programar ni abrir ningún archivo de código.

Hay tres formas de hacer lo mismo. Elige la que te resulte más cómoda:

| | |
|---|---|
| **El panel de la tienda** | En `nutretium.com/admin.html`, con tu cuenta. Desde cualquier ordenador, y publica solo. Recomendado. |
| **El panel local** | La misma pantalla, pero en el ordenador del desarrollador. |
| **Excel** | La misma tabla, en una hoja de cálculo. |

> **Usa una, no varias a la vez.** Las tres escriben en el mismo sitio, así que
> si dejas cambios a medias en una y abres otra, gana la última.

---

## Vía 1 — El panel de la tienda (recomendada)

### Entrar

Abre **<https://nutretium.com/admin.html>** y entra con tu correo y tu
contraseña de la tienda. También está en el menú de tu cuenta, en
**Panel de catálogo**.

Solo entran las cuentas dadas de alta como administrador. Si te dice que tu
cuenta no tiene acceso, es que falta añadir tu correo a la lista de
administradores: eso se hace en el panel de Netlify, no aquí (`ADMIN_EMAILS`,
ver `DESPLIEGUE.md`).

### Publicar

Se edita igual que el panel local (lo de abajo vale para los dos). La
diferencia es el botón: aquí pone **Publicar cambios**, y al pulsarlo:

1. te enseña la lista de lo que va a cambiar y espera a que confirmes;
2. guarda el cambio en el repositorio;
3. la web se actualiza sola en **uno o dos minutos**.

Si la abres antes de que pase ese minuto, todavía verás lo anterior. No lo
vuelvas a publicar: espera y recarga.

Cada publicación queda registrada con tu correo y se puede deshacer, así que un
error no es un problema: se avisa y se vuelve atrás.

---

## Vía 2 — El panel local

### Abrirlo

Doble clic en **`scripts/ABRIR PANEL.bat`**. Se abre una ventana negra (déjala
abierta, es el motor) y el navegador con el panel.

Si el navegador no se abre solo, entra en <http://localhost:4180>.

Para cerrarlo: cierra la ventana negra.

### Qué puedes hacer

- **Cambiar un precio** → escribe el número nuevo en la columna *Precio €*.
- **Cambiar el stock** → el número de unidades que quedan. Escribe `siempre`
  en los que se preparan al momento (bowls, cafés, smoothies, waffles…): esos
  no se cuentan y nunca salen agotados.
- **Dejar de vender algo un tiempo** → desmarca **Publicado**. Desaparece de la
  web pero su ficha se conserva; vuelve marcando la casilla otra vez.
  *Es lo que hay que hacer casi siempre. Es reversible.*
- **Quitar un producto para siempre** → botón **✕** del final de la fila.
- **Añadir un producto** → botón **+ Añadir producto** arriba.
- **Poner o cambiar una foto** → clic en el cuadrito de la izquierda de la fila
  y elige la foto. Se recorta y se prepara sola.
- **Destacado** → sale en los carruseles de la portada.
- **Etiqueta** → el cartelito de la ficha (`Nuevo`, `Oferta`…). Déjalo vacío si
  no quieres ninguno.

Los buscadores y filtros de arriba sirven para encontrar rápido: por nombre, por
categoría, los que no están publicados, los que no tienen foto y los agotados.

### Guardar

El botón **Guardar cambios** se enciende en cuanto tocas algo. Al pulsarlo
**primero te enseña la lista de lo que va a cambiar** y no hace nada hasta que
confirmas. Si algo está mal (un precio en blanco, una categoría que no existe)
te lo dice y no guarda nada.

---

## Vía 3 — Excel

**1.** Saca la hoja con lo que hay publicado ahora mismo:

```
npm run catalogo -- --exportar --forzar
```

**2.** Abre `sources/_catalogo/CATALOGO.csv` con Excel y cambia lo que haga falta.

| Columna | Qué se pone |
|---|---|
| `codigo` | El del TPV. **No se toca**: es lo que identifica al producto para siempre. |
| `nombre` | Como sale en la web. |
| `categoria` | Una de las que ya existen, escrita igual. |
| `precio` | `12,50`. |
| `stock` | Unidades que quedan, o `siempre` si no se controla. |
| `activo` | `SI` se publica, `NO` se oculta de la web. |
| `destacado` | `SI` para que salga en la portada. |
| `etiqueta` | `Nuevo`, `Oferta`… o vacío. |
| `marca` | La marca, o vacío si es de la casa. |
| `foto` | No se escribe a mano: lo rellenan el panel y `npm run fotos`. |

Para **añadir** un producto, añade una fila al final con su código nuevo.
Para **quitarlo**, borra su fila.

**3.** Guarda en Excel (que siga siendo *CSV separado por punto y coma*) y mira
qué va a pasar — esto **no cambia nada todavía**:

```
npm run catalogo
```

**4.** Si la lista que sale es correcta, aplícalo:

```
npm run catalogo -- --aplicar
```

---

## Las fotos

Lo más cómodo es ponerlas desde el panel, una a una.

Si te llegan muchas de golpe, déjalas todas en `sources/_nuevas/` con el código
del producto delante (`00347__milkshake banana.jpg`) y lanza `npm run fotos`
para ver el reparto y `npm run fotos -- --aplicar` para hacerlo. Las
instrucciones completas están en `sources/_nuevas/LEEME.md`.

Los productos a los que les falta foto, agrupados por proveedor, salen solos en
`sources/productos/FOTOS_PENDIENTES.md`.

---

## Publicar cuando has usado el panel local o Excel

El panel de la tienda publica solo. Las otras dos vías no: **guardar ahí escribe
en el ordenador, no en internet.** Para que se vea en la web hay que subirlo, y
eso lo hace quien lleva el git del proyecto:

```powershell
Copy-Item -Path "C:\Users\vnzla\Downloads\Nutretium-main\*" -Destination "C:\Users\vnzla\Downloads\nutretium-git\Nutretium" -Recurse -Force
cd C:\Users\vnzla\Downloads\nutretium-git\Nutretium
git add -A
git commit -m "Catálogo: actualización de precios y productos"
git push
```

Netlify despliega solo en un par de minutos.

Ojo con lo de siempre (está en `CLAUDE.md`): copiar **no borra** en la carpeta
del repositorio los archivos que se hayan eliminado aquí. Si has borrado algún
archivo, hace falta un `git rm` además de la copia.

**Y al revés, desde que existe el panel de la tienda:** cuando la tienda publica
desde `/admin.html`, el repositorio se adelanta a la carpeta de trabajo. Antes
de tocar nada en local hay que traerse lo que haya publicado:

```powershell
cd C:UsersnzlaDownloads
utretium-gitNutretium
git pull
Copy-Item -Path "C:UsersnzlaDownloads
utretium-gitNutretiumproducts-data.js" -Destination "C:UsersnzlaDownloadsNutretium-main" -Force
Copy-Item -Path "C:UsersnzlaDownloads
utretium-gitNutretiumsourcesproductos" -Destination "C:UsersnzlaDownloadsNutretium-mainsources" -Recurse -Force
```

Y después, en la carpeta de trabajo, `npm run catalogo -- --exportar --forzar`
para que el Excel vuelva a decir lo mismo que la web.

---

## Productos que no se venden online

Hay una lista negra de códigos que **no se publican nunca**, ni aunque alguien
los vuelva a meter en la hoja o se regenere el catálogo desde el listado del
ERP. Vive en `netlify/lib/no-vendibles.js`.

Ahí están los refrescos y energéticas de marca ajena (Coca-cola, Fanta, Kas,
Aquarius, Nestea, Seven Up, Trina, Dr Pepper, Chupa Chups, Cacaolat, Bifrutas,
Don Simón, Monster y Red Bull): se venden en el mostrador, pero no en la tienda
online.

Se añade desde cualquiera de los dos paneles: al quitar un producto, marcando
**«No volver a publicarlo nunca»**. Para que uno vuelva a la web hay que borrar
su línea de ese archivo a propósito, y eso ya es cosa del desarrollador. Los
paneles avisan si intentas dar de alta un código vetado.

---

## Si algo sale mal

Nada se pierde: todo lo que tocan estas herramientas está en el repositorio, así
que siempre se puede volver atrás con git. Antes de subir, revisa el resumen que
te enseñan y, si dudas, pregunta antes de hacer `git push`.

Después de tocar precios conviene pasar las pruebas:

```
npm test
```
