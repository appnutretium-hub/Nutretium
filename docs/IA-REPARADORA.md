# IA reparadora: revisa y repara errores sola, durante horas

`npm run ia:reparar` pone a trabajar al Ollama de tu equipo sobre el código de
la tienda durante el tiempo que le digas (10 horas por defecto). Pasa las
pruebas, convierte cada fallo en un **tiquet** y lo lleva por siete etapas
hasta dejarlo arreglado y comprobado. Con todo en verde, revisa los archivos
uno a uno buscando errores. Trabaja callada: no te pregunta nada y al terminar
te deja un resumen y un informe en `.ia-reparador/INFORME.md`.

## Ponerla en marcha

1. **Ollama instalado y abierto.** Si ya emparejaste el equipo con
   `scripts/install-nutretium-ollama.ps1`, ya está. Si no: instálalo desde
   ollama.com.
2. **Un modelo descargado.** Vale el `qwen3:4b` que ya usa AI Corporation, pero
   para código rinde bastante mejor un modelo de programación:

   ```powershell
   ollama pull qwen2.5-coder:7b
   ```

3. **Lanzarla**, desde la carpeta del proyecto (PowerShell):

   ```powershell
   # Ensayo: no toca nada, solo deja las reparaciones verificadas como propuestas
   npm run ia:reparar -- --modelo qwen2.5-coder:7b

   # De verdad y sin ventana: puedes cerrar PowerShell y sigue trabajando
   npm run ia:reparar -- --modelo qwen2.5-coder:7b --horas 10 --aplicar --segundo-plano
   ```

   O doble clic en `scripts\IA REPARADORA.bat` (10 horas, aplicando, en segundo
   plano, con el modelo de `AI_OLLAMA_MODEL` o `qwen3:4b`).

Mientras trabaja:

```powershell
npm run ia:estado                 # cómo va, qué parches lleva
npm run ia:reparar -- --parar     # que pare al terminar el paso en curso
```

Si Ollama se cierra o no está abierto al empezar, **no se cae**: espera a que
vuelva (cada vez un poco más, hasta 5 minutos) y sigue. Si se corta por lo que
sea, la siguiente vez sigue donde lo dejó.

**Que el equipo no se duerma.** Si Windows suspende el equipo, la IA se para
con él. Para una noche entera: Configuración → Sistema → Inicio/apagado →
«Suspender: nunca» mientras dure.

## Las siete etapas de cada error

Cada caso que falla es un tiquet, y cada tiquet tiene su carpeta en
`.ia-reparador/tiquets/`. Cada etapa deja ahí su documento, numerado, así que
para saber qué ha pasado con un error basta con leerlos en orden:

| | Etapa | Qué hace | Documento |
|---|---|---|---|
| 1 | **Tiquet** | Recibe el caso que falla y lo enriquece: la causa, el archivo, las líneas, la evidencia y el historial de ese error | `01-TIQUET.md` |
| 2 | **Plan** | Qué se va a cambiar, los riesgos y el **mapa de criterios de aceptación** | `02-PLAN.md` |
| 3 | **Implementación** | El cambio mínimo que cumple el plan, aplicado en un espacio aparte, nunca sobre tus archivos | `03-IMPLEMENTACION.md` |
| 4 | **Revisión de código** | Lo lee como un PR: lo que tapa el síntoma en vez de arreglar la causa es **bloqueante** y vuelve a la 3; lo que es mejorable es **sugerencia** y va a la 7 | `04-REVISION.md` |
| 5 | **QA** | Las pruebas: el caso deja de fallar, su suite no pierde nada y ninguna suite en verde se rompe | `05-QA.md` |
| 6 | **Release** | Se guarda como parche con número. Con `--aplicar` se escribe en el proyecto y se vuelve a pasar la prueba allí; si allí falla, se deshace solo | `06-RELEASE.md` |
| 7 | **Address-review** | Atiende las sugerencias de la revisión como un parche aparte que también pasa QA. Si no sale, quedan escritas para ti y el arreglo principal no se toca | `07-ADDRESS-REVIEW.md` |

Las etapas 3, 4 y 5 se repiten hasta que un intento cumple todo el mapa (hasta
6 intentos por error). Cada vez que uno no vale, la implementación recibe el
motivo exacto y sabe qué no repetir.

### El mapa de criterios de aceptación

Terminado significa **todos los criterios en ✅ (o ➖ si no aplican)**. Los seis
primeros son siempre los mismos y los comprueba una máquina, no la IA:

| | Criterio | Lo comprueba |
|---|---|---|
| CA-1 | El caso deja de fallar | QA |
| CA-2 | Su suite no pierde ningún caso que ya pasaba | QA |
| CA-3 | Las demás suites en verde siguen en verde | QA |
| CA-4 | No toca pruebas, precios, secretos ni configuración, y compila | implementación |
| CA-5 | Arregla la causa, no el síntoma | revisión |
| CA-6 | En el proyecto, tras publicarlo, la prueba sigue en verde | release (solo con `--aplicar`) |

Del CA-7 en adelante (como mucho tres) son los propios de ese error, los
propone el plan y los comprueba la revisión de código. La tabla, con el
resultado de cada uno, está en `02-PLAN.md`.

## Un error se corrige una vez

La IA lleva un registro (`.ia-reparador/correcciones.json`) que dura entre
sesiones:

* Un error ya corregido que **vuelve a fallar no se corrige otra vez**: algo lo
  ha deshecho o el arreglo no era el bueno, y eso lo decides tú. Sale en el
  informe, en «Necesitan a una persona».
* Lo que verificó en **ensayo se reutiliza** al pasar a `--aplicar`, sin volver
  a preguntar a la IA (pero volviendo a pasar QA, por si el proyecto cambió).
* Una propuesta ya probada y descartada **no se vuelve a probar**.
* Si un error agota los intentos, queda «sin resolver» y solo se reintenta si
  alguien cambia los archivos implicados.
* Un parche que deshaces tú no se vuelve a aplicar.

## Probarlo y deshacerlo, parche a parche

Cada reparación es un parche suelto en `.ia-reparador/parches/` (un `.json` y
un `.diff` para leerlo):

```powershell
npm run ia:probar                                  # todas las pruebas, sobre el proyecto
npm run ia:probar -- 0007                          # el parche 7: su prueba primero, y los criterios
npm run ia:reparar -- --revertir 0007              # enseña qué desharía
npm run ia:reparar -- --revertir 0007 --aplicar    # lo deshace
```

Si el parche es una propuesta (ensayo), `ia:probar` lo prueba en el espacio
aparte sin tocar tus archivos. Un parche de address-review depende del
principal: para deshacerlos, primero el de address-review.

## Lo que tiene prohibido

Un modelo pequeño que quiere que una prueba pase propondrá, tarde o temprano,
cambiar la prueba o quitar la comprobación que falla. Por eso rechaza, antes de
probar nada, cualquier cambio que:

* toque una prueba (`scripts/test-*`, `tests/`, `*.spec.js`);
* toque `products-data.js`, `netlify.toml`, `package.json`, `styles.css`,
  `_headers`, `_redirects`, `.env*`, cualquier cosa de `sources/` o su propio
  código (`scripts/ia/`, `scripts/ia-reparador.js`);
* quite una comprobación de seguridad (`JWT_SECRET`, `ADMIN_EMAILS`, respuestas
  401/403/503, `timingSafeEqual`…);
* invente un valor por defecto para un secreto;
* meta `eval`, `new Function`, `child_process` o `process.exit`;
* cree archivos nuevos;
* añada un `catch` vacío, cambie la lógica por un valor fijo o borre una
  comprobación (esto lo pilla la revisión sin gastar consulta a la IA).

Las pruebas corren **sin tus variables de entorno**: así no dependen de lo que
tengas puesto en el equipo y ningún secreto acaba en lo que se le enseña a la
IA. Y Ollama tiene que ser local (`127.0.0.1`): si le das una dirección de
fuera, no arranca. El código de la tienda no sale del equipo.

Los posibles errores que encuentra al revisar con todo en verde **no se
aplican nunca**: ninguna prueba los respalda. Son pistas para que las mires tú.

## Después

1. Lee `.ia-reparador/RESUMEN.txt` (diez líneas) o `INFORME.md` (entero).
2. Para cada parche, su tiquet en `.ia-reparador/tiquets/` cuenta el porqué.
3. Si has usado `--aplicar`, revisa los cambios con `git diff` en la carpeta
   del repositorio. Las copias de antes están en `.ia-reparador/copias/`.
4. `npm run ia:probar` y, si todo cuadra, haz el commit.

Recuerda que hay **dos carpetas** (ver `CLAUDE.md`): si la lanzas en la de
trabajo, lo reparado hay que copiarlo después a la del repositorio.

## Opciones

| | |
|---|---|
| `--aplicar` | guarda en el proyecto las reparaciones verificadas (sin esto, ensayo) |
| `--horas N` | cuánto tiempo trabaja (por defecto 10, máximo 72) |
| `--segundo-plano` | arranca sin ventana; lo que escriba va a `.ia-reparador/salida.log` |
| `--detalle` | enseña cada paso en pantalla (siempre queda en `registro.log`) |
| `--modelo NOMBRE` | modelo de Ollama (por defecto `AI_OLLAMA_MODEL` o `qwen3:4b`) |
| `--solo a,b` | solo esas comprobaciones, p. ej. `--solo test,test:redsys` |
| `--sin-revision` | no revisa archivos cuando todo está en verde |
| `--reiniciar` | olvida el registro y lo revisado en ejecuciones anteriores |
| `--estado` · `--parar` | cómo va · que pare (también `npm run ia:estado`) |
| `--probar [N]` · `--revertir N` | ver arriba |

`npm run test:ia` comprueba la herramienta sin necesitar Ollama: usa uno falso
que contesta según la etapa y un proyecto de juguete con un error sembrado.
