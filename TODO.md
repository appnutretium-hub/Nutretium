# TODO — estado real de cierre

Documento actualizado tras el hardening final. Los puntos de código que ya están implementados no se vuelven a listar como pendientes.

## Código y CI — HECHO

- Checkout con revaloración en servidor, persistencia obligatoria e idempotencia.
- Redsys con callback firmado como fuente de verdad de pago.
- Redsys protege el estado terminal `PAID`, tolera callbacks válidos duplicados sin doble compromiso de inventario y separa el cobro inicial de otros tipos de operación.
- Separación entre estado de pago y fulfilment.
- Back Office, tracking, cuenta cliente, recompra, carrito guardado y favoritos.
- Cambio y recuperación de contraseña, verificación de email y revocación de sesiones.
- Seguimiento seguro para pedidos de invitado.
- Rate limiting en endpoints sensibles.
- Auditoría de arquitectura, seguridad y claims; suite E2E ejecutada en CI con Chromium, Firefox y WebKit.
- Quality Gates de GitHub para build, seguridad, integridad y navegador.
- Node 22 alineado entre CI y Netlify.
- Points fail-closed y activación explícita.
- Cupones y promociones sin valores inventados.
- Envíos fail-closed hasta tener configuración comercial real.
- Modo mantenimiento, health check y logging de errores de cliente.

## Pendientes EXTERNOS / NO VALIDABLES DESDE EL REPOSITORIO

Estos puntos no deben marcarse como resueltos sin evidencia real del servicio o del negocio.

### 1. Netlify producción

Confirmar que `nutretium.com` sirve exactamente el SHA de `main` que haya superado los gates requeridos.

### 2. Variables privadas de producción

Configurar y validar en Netlify, sin exponer valores:

- `JWT_SECRET`
- `ADMIN_EMAILS`
- `GITHUB_TOKEN`
- `NETLIFY_API_TOKEN`
- `REDSYS_SECRET_KEY`
- `REDSYS_MERCHANT_CODE`
- `REDSYS_ENV=production`
- `COMMERCE_LIVE=true` SOLO después de la prueba bancaria real
- `RESEND_API_KEY`
- `ORDER_NOTIFICATION_EMAIL`
- `ORDER_EMAIL_FROM` con dominio verificado
- `MFA_ENCRYPTION_KEY`
- `STAFF_TOTP_SECRETS` o aprovisionamiento MFA individual antes del primer acceso privilegiado
- `REQUIRE_STAFF_MFA=true`
- `REQUIRE_PRODUCT_COMPLIANCE=true`
- variables de envío si se habilita delivery

`/.netlify/functions/system-health` debe quedar con `ready:true` antes de considerar la tienda preparada para cobro real.

### 3. Administrador privado

`ADMIN_EMAILS` no puede coincidir con el correo público de contacto. Crear/usar una cuenta privada de administración y comprobar que la cuenta pública no tiene privilegios.

Cuando eso esté verificado, retirar `SECRETS_SCAN_OMIT_KEYS = "ADMIN_EMAILS"` de `netlify.toml` y volver a desplegar para que el escáner de secretos actúe sin excepciones.

### 4. Redsys real

Ejecutar una compra real de importe bajo y comprobar de extremo a extremo:

1. checkout;
2. redirección a Redsys producción;
3. autorización bancaria;
4. callback firmado;
5. pedido `PAID`;
6. persistencia en Blobs;
7. email de pedido;
8. pedido visible en Back Office.

No sustituir esta prueba por un test de CI.

### 5. Email real

Verificar dominio/remitente en Resend y probar entrega real a cliente y a Nutretium.

### 6. Envíos

Definir proveedor, zonas, tarifa, IVA aplicable, umbral de envío gratis, SLA y credenciales de integración. Hasta entonces `SHIPPING_ENABLED=false`.

### 7. Stock físico pendiente

Completar el stock real de las referencias cuyo inventario sigue sin estar documentado. No estimar cantidades.

### 7 bis. Expedientes de producto

Los 80 productos activos tienen SKU, pero el catálogo fuente no aporta GTIN, descripción documentada, ingredientes, alérgenos ni tabla nutricional estructurada. Cargar y aprobar el expediente real de cada SKU en `product-compliance`. El checkout de producción queda deliberadamente bloqueado para referencias sin aprobación y evidencias; `COMPLIANCE_EXEMPT_SKUS` solo debe usarse para excepciones documentadas.

### 8. Fotografías reales/licenciadas

Completar las imágenes faltantes con fotos propias o packshots autorizados. No hacer scraping automático ni publicar imágenes sin licencia.

### 9. AMIX

El catálogo actual mantiene las referencias AMIX excluidas por decisión histórica de catálogo. Si se quieren vender online, hace falta una fuente vigente con SKU, PVP, stock, imágenes autorizadas y documentación de producto antes de activarlas.

### 10. TPVsol

La sincronización automática de stock web ↔ TPVsol no está validada. Implementarla solo cuando se disponga del mecanismo/API/exportación soportada y de una especificación real del flujo de stock.

### 11. Protección de `main`

Los workflows existen y pasan, pero la protección/ruleset de la rama depende de permisos administrativos de GitHub. Configurar un ruleset que obligue a pasar los Quality Gates antes de fusionar o actualizar `main`.

### 12. Cuenta de Google

Definir qué integración necesita la web (inicio de sesión de clientes, Merchant Center, Analytics, Drive u otra). No se ha enlazado ninguna cuenta porque el proyecto no incluye credenciales OAuth ni una decisión de alcance. Configurarla solo mediante OAuth y secretos del proveedor; nunca incluir credenciales en el repositorio.

## Regla de cierre

La web puede considerarse técnicamente validada cuando los gates requeridos estén en verde sobre el mismo SHA. La tienda puede considerarse preparada para comercio real únicamente cuando, además, `system-health` esté en verde con configuración real y se haya completado la prueba bancaria de producción.
