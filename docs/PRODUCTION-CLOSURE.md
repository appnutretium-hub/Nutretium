# Cierre de producción: evidencia y recuperación

Estado al 29-09-2026. Esta guía separa cambios de código de acciones que requieren acceso a GitHub, Netlify, banco y proveedores. Ningún servicio externo se considera certificado por pasar tests locales.

## 1. Despliegue y revisión exacta (P0)

1. Registrar el SHA de `main` y comprobar que Full Quality Gate termina correctamente para ese SHA.
2. Confirmar en Netlify que el deploy de producción procede de `main`, que su `COMMIT_REF` coincide con ese SHA y que terminó publicado, no solo construido.
3. Consultar `https://nutretium.com/build-meta.json` con una query aleatoria para evitar caché. `commitRef` debe coincidir exactamente con el SHA esperado.
4. Ejecutar Production Smoke contra esa revisión y guardar la URL del run. Si falla, revisar los logs del deploy y la configuración de rama/sitio/dominio antes de reintentar. No alterar el SHA esperado ni marcar verde un deploy anterior.
5. Si el candidato publicado falla en funciones críticas, detener nuevas publicaciones, investigar el incidente y restaurar el último deploy sano según el procedimiento de Netlify; registrar el SHA servido tras la recuperación.

El build de producción ahora falla si Netlify no proporciona un SHA válido en `COMMIT_REF`, si su rama no es `main`, o si `COMMIT_REF` y `GITHUB_SHA` válidos se contradicen en producción. En un PR pueden ser distintos porque GitHub comprueba un commit de merge temporal. Este control no realiza el deploy.

## 2. Gobierno de la rama (P0)

Configurar un ruleset de GitHub para `main` con PR obligatorio, bloqueo de borrado y force push, y checks requeridos usando los nombres exactos que aparecen en los runs exitosos de Full Quality Gate. Activar revisión CODEOWNERS solo después de comprobar que sus propietarios tienen acceso y que el check de revisión es aplicable al plan del repositorio. Reducir bypass a los responsables de incidentes; documentar cada uso. Abrir un PR de prueba con un check fallido y comprobar que GitHub bloquea realmente la fusión. La existencia de YAML no demuestra protección.

## 3. Identidad, secretos y salud (P0)

Crear un correo administrativo privado distinto de `CONTACT_EMAIL` y `ORDER_NOTIFICATION_EMAIL`; enrolar MFA para cada identidad con acceso y verificar inicio, revocación y recuperación en un entorno controlado. Actualizar `ADMIN_EMAILS` en Netlify. Solo después de confirmar que el escáner de secretos no detecta falsos positivos, retirar `SECRETS_SCAN_OMIT_KEYS = "ADMIN_EMAILS"` y ejecutar el build real. No registrar valores de secretos en tickets, capturas ni CI.

Revisar cada check de `system-health` con credenciales reales en Netlify y obtener `ready:true`. Registrar únicamente el nombre del check, estado, fecha y evidencia; los valores secretos quedan en el gestor de secretos. Un `ready:false` impide certificar comercio en vivo aunque la tienda pública cargue.

## 4. Banco, correo, transporte y TPV (P0/P1)

**Redsys:** con credenciales de producción autorizadas, hacer una compra real de importe bajo; guardar ID de pedido, referencia bancaria y trazas sin datos de tarjeta. Comprobar firma del callback, transición única a PAID, stock, email, back office y conciliación. Probar un callback repetido y una operación fallida. El reembolso se comprueba por separado con autorización comercial.

**Resend:** validar dominio y remitente, enviar a una cuenta controlada, comprobar entrega y evento de rebote; no basta la respuesta de aceptación del API.

**Transporte:** aprobar zonas, tarifa, mínimo, SLA y proveedor; crear envío de prueba, verificar etiqueta, tracking, webhook y excepción operativa.

**TPVsol:** exportar e importar un lote controlado, cotejar SKU, EAN, IVA, precio y stock en ambos sistemas; resolver conflictos y probar rollback antes de sincronización masiva.

## 5. Catálogo, arquitectura y seguridad (P1)

Mantener bloqueado cada SKU sin expediente aprobado. Completar GTIN, ingredientes, alérgenos, nutrición, advertencias, imagen autorizada y evidencia de fabricante por referencia. La ausencia de documentación no se rellena mediante inferencias.

Migrar el frontend por dominios funcionales a `src/`, con contrato y pruebas por módulo. Mantener `products-data.js` como entrada actual hasta disponer de un catálogo canónico aprobado y una migración reversible; entonces generar el snapshot de frontend y alimentar checkout, feed y TPV desde el mismo modelo versionado.

Inventariar scripts inline y atributos `on*` antes de quitar `unsafe-inline`. Migrar handlers, emitir primero una CSP Report-Only y examinar violaciones reales de storefront, checkout y panel; aplicar la política estricta solo tras pruebas en navegador. Quitar `unsafe-inline` ahora rompería controles de la interfaz actual.

## 6. Evidencia mínima para cierre

| Control | Evidencia exigida |
|---|---|
| Código | PR, diff, tests, build y revisión humana |
| Producción | SHA main = SHA deploy = `build-meta.json`, smoke verde |
| Seguridad | Ruleset aplicado, MFA real, escáner sin omisión |
| Comercio | `system-health ready:true`, operación bancaria conciliada |
| Datos | Expediente y aprobación por SKU publicable |
| Integraciones | Entrega/seguimiento y conciliación con cada proveedor |

### Incidente y recuperación

Anotar hora, SHA publicado, alcance, síntomas y responsable. Detener publicación de cambios, conservar logs y preservar evidencia. Si afecta cobros o datos, desactivar comercio mediante la configuración operativa prevista y verificar que la tienda responde de forma segura. Recuperar el último deploy sano y, si procede, los datos desde un backup probado en un entorno aislado; verificar integridad y registrar la hora de vuelta a servicio. La restauración de datos nunca debe sobrescribir pedidos recientes sin conciliación manual.

### Decisión de arquitectura 001

Se mantiene temporalmente `products-data.js` como fuente existente porque checkout y frontend lo consumen. La migración a catálogo canónico requiere mapeo de SKU, reglas de versiones, reconciliación de precios e IVA, y pruebas paralelas antes del cambio. La decisión evita dos fuentes maestras simultáneas.
