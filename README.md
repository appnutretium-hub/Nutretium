# Nutretium

Aplicación web y ecommerce de Nutretium desplegada en Netlify, con frontend estático, Netlify Functions, persistencia en Netlify Blobs y automatización mediante GitHub Actions.

## Requisitos

- Node.js 22
- npm
- Variables de entorno según `.env.example`

## Comandos principales

- `npm ci`: instala dependencias bloqueadas.
- `npm run build`: genera los artefactos del storefront.
- `npm test`: ejecuta la suite principal.
- `npm run test:enterprise`: valida la plataforma Enterprise.
- `npm run test:contracts`: valida contratos de módulos, autorización y coherencia de runtime.

## Arquitectura

- Frontend: archivos estáticos de la raíz del proyecto.
- Backend: `netlify/functions/`.
- Librerías compartidas: `netlify/lib/`.
- Catálogo: `products-data.js` como fuente de producto usada por frontend y funciones de cobro.
- Datos operativos: Netlify Blobs mediante `netlify/lib/blob-store.js`.
- CI/CD: `.github/workflows/`.

## Seguridad

Los secretos no deben guardarse en Git. Usa las variables de entorno del proveedor de despliegue. Consulta `SECURITY.md` para el procedimiento de seguridad y `.env.example` para las variables esperadas.

Los cambios destinados a producción deben pasar `Nutretium Build & Enterprise Gate` y `Nutretium Full Quality Gate` antes de fusionarse en `main`.

## Despliegue

Netlify usa `netlify.toml`. El runtime del proyecto está alineado con Node 22. Antes de cambios de autenticación, pagos, catálogo o persistencia, trabaja en rama, valida los quality gates y conserva una ruta de rollback.

## Backups

La plataforma Enterprise genera snapshots diarios en Netlify Blobs. Los snapshots incluyen conteos por dominio y checksum de integridad. Una restauración valida el snapshot completo y crea una copia de seguridad previa antes de escribir datos.
