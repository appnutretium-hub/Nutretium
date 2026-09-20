# CIERRE MAESTRO — NUTRETIUM WEB

Fecha de revisión: 2026-09-20

Este documento sustituye checklists anteriores. Solo se marca **VERDE** cuando el punto está implementado y puede validarse desde código/pruebas. Los puntos que dependen de credenciales, proveedor, datos reales, licencias o una prueba externa permanecen **ÁMBAR** hasta disponer de evidencia. No se convierten en verde por estimación.

## 1. CÓDIGO / TIENDA ONLINE

| Área | Estado | Criterio de cierre |
|---|---|---|
| Checkout con revaloración en servidor | VERDE | El servidor recalcula carrito, promociones, envío, beneficios y total antes de crear el pago. |
| Idempotencia checkout | VERDE | X-Nutretium-Request + fingerprint evita duplicación accidental. |
| Reserva de inventario | VERDE | Reserva antes de iniciar pago y libera ante fallo de preparación/persistencia. |
| Checkout invitado | VERDE | Compra sin cuenta con validación de nombre, email y dirección. |
| Redsys: firma y callback | VERDE CÓDIGO | Integración y validación firmada implementadas; producción depende de credenciales reales. |
| Cupones | VERDE | Motor de promociones y gestión desde Ajustes. |
| Política de envío | VERDE CÓDIGO | Gestionable desde Ajustes y fail-closed si falta tarifa válida. |
| Cuenta cliente | VERDE | Pedidos, devoluciones, tickets, privacidad, reseñas, referidos, gift card, B2B y seguridad. |
| Favoritos | VERDE | Local + sincronización autenticada. |
| Carritos guardados | VERDE | Persistencia y archivo. |
| Alertas de stock | VERDE | Alta/cancelación desde cuenta/ficha. |
| Reseñas verificadas | VERDE | Exige pedido PAID y producto presente en pedido. |
| Preguntas de producto | VERDE | Envío, moderación y publicación/respuesta. |
| Factura PDF | VERDE CON CONDICIÓN | Solo se emite si existe desglose fiscal validado. |
| Devoluciones RMA | VERDE CÓDIGO | Solicitud, aprobación, recepción, inspección, refund y cierre. |
| Suscripciones | ÁMBAR EXTERNO | Worker, idempotencia, stock, compliance y cobro vía proveedor están implementados; falta proveedor/tokenización real. |
| Gift cards como saldo consultable | VERDE | Consulta y administración disponibles. |
| Gift card como método de pago | VERDE CÓDIGO | El checkout descuenta saldo antes de Redsys; la liquidación se ejecuta solo al confirmar PAID y es idempotente. |
| Referidos | VERDE MOTOR | Valida código, bloquea autorreferido, aplica descuento configurado y recompensa al titular tras PAID. Los importes son configuración comercial. |
| Fidelización | VERDE MOTOR | Canje y acumulación están integrados en checkout/finalización con liquidación idempotente. Tasas y reglas económicas son configuración comercial. |

## 2. PRODUCTO / PIM / SEO

| Área | Estado | Criterio de cierre |
|---|---|---|
| URL individual de producto | VERDE | /producto/<slug>-<id>. |
| Landing de categoría | VERDE | /categoria/<slug>. |
| Landing de marca | VERDE | /marca/<slug>. |
| Landing por objetivo | VERDE | /objetivo/<slug>. |
| Canonical | VERDE | Producto y colecciones. |
| Product schema | VERDE | JSON-LD en ficha. |
| Breadcrumb schema | VERDE | JSON-LD en ficha. |
| CollectionPage + ItemList | VERDE | Landings SEO. |
| Sitemap dinámico: productos | VERDE | Incluido. |
| Sitemap dinámico: categorías | VERDE | Incluido. |
| Sitemap dinámico: marcas | VERDE | Incluido. |
| Sitemap dinámico: objetivos | VERDE | Incluido. |
| Merchant Center feed | VERDE CÓDIGO ENDURECIDO | Feed XML no publica stock desconocido, refleja agotado/disponible desde stock numérico real y solo emite GTIN desde ficha avanzada aprobada. Alta/revisión de Google siguen externas. |
| Variantes | VERDE INFRAESTRUCTURA | SKU, nombre, sabor, tamaño, precio y disponibilidad. |
| Galería de imágenes | VERDE INFRAESTRUCTURA | Admite múltiples medios. |
| Zoom de producto | VERDE | Disponible en imagen principal. |
| Vídeo de producto | VERDE CÓDIGO | Reproducción HTML5 desde medios kind=video. |
| EAN/GTIN | ÁMBAR DATOS | Validador y uso en feed disponibles; faltan códigos reales/aprobados en referencias. |
| Ingredientes | ÁMBAR DATOS | Campo disponible; faltan datos de fabricante en múltiples SKU. |
| Nutrición | ÁMBAR DATOS | Campo disponible; faltan datos reales. |
| Alérgenos | ÁMBAR DATOS | Campo disponible; faltan datos reales. |
| Modo de empleo | ÁMBAR DATOS | Campo disponible; faltan datos reales. |
| Advertencias | ÁMBAR DATOS | Campo disponible; faltan datos reales. |
| Documentación regulatoria | ÁMBAR DATOS | No se aprueba compliance sin evidencia. |
| Fotografías | ÁMBAR EXTERNO | Quedan referencias sin foto propia/licenciada. No se inventan ni scrapean. |

## 3. ENTERPRISE / BACK OFFICE

| Área | Estado | Criterio de cierre |
|---|---|---|
| RBAC | VERDE | owner/admin/compliance/manager/operator/support/custom/client. |
| MFA/TOTP | VERDE CÓDIGO | Activación condicionada a política y enrolamiento real. |
| Enterprise panel | VERDE | CRUD de dominios con permisos. |
| Command Center | VERDE | Estado operativo, alertas y calidad de catálogo. |
| Inventario | VERDE INFRAESTRUCTURA | Stock físico/reservado/reorder por almacén. |
| Multi-almacén | VERDE INFRAESTRUCTURA | warehouses + inventory. |
| Proveedores | VERDE INFRAESTRUCTURA | Dominio y permisos. |
| Compras | VERDE INFRAESTRUCTURA | Purchase orders y recepción. |
| Envíos | VERDE INFRAESTRUCTURA | Shipment lifecycle, etiquetas/tracking vía proveedor. |
| Devoluciones | VERDE | Workflow RMA. |
| CRM | VERDE BASE | Tickets, reviews, wishlists, alerts y privacidad. |
| B2B | VERDE BASE | Solicitud, cuentas y listas de precios. |
| Promociones | VERDE | percent/fixed/free_shipping/bundle/gift/multibuy/segunda unidad. |
| CMS | VERDE BASE | cms-blocks gestionable; editor visual avanzado no es requisito de seguridad. |
| Feature flags | VERDE BASE | Dominio disponible. |
| Experimentos | VERDE BASE | Dominio disponible. |
| Webhooks | VERDE BASE | Validación HTTPS y delivery domain. |
| Automatizaciones | VERDE BASE | Reglas y worker programado. |
| Antifraude | VERDE BASE | Reglas gestionables; reglas concretas dependen del negocio. |
| Food Safety / UE | VERDE SISTEMA | Aprobación exige evidencia documental completa. |
| Backups diarios | VERDE | Snapshot + checksum + verificación + retención. |
| Restore | VERDE CÓDIGO | Función disponible; simulacro real sigue siendo evidencia operativa externa. |
| Readiness externo | VERDE CÓDIGO | Panel/admin valida SHA desplegado, Resend, Redsys, envío y TPV; no convierte dependencias pendientes en verde. |

## 4. SEGURIDAD / CI

| Área | Estado | Criterio de cierre |
|---|---|---|
| JWT / sesiones | VERDE | Sesiones y revocación implementadas. |
| Rate limiting | VERDE | Login y checkout protegidos. |
| CSP / headers | VERDE | Headers de seguridad en Netlify. |
| Secretos fuera del repo | VERDE DISEÑO | .env.example sin secretos; valores reales pertenecen al proveedor de despliegue. |
| Quality Gates | VERDE CÓDIGO | Build/enterprise/browser E2E disponibles. |
| Pruebas SEO | VERDE | Productos, categorías, marcas y objetivos cubiertos. |
| Pruebas beneficios comerciales | VERDE CÓDIGO | Gift card, puntos y referidos tienen pruebas transaccionales e idempotentes. |
| Pruebas Merchant feed | VERDE CÓDIGO | Stock desconocido, disponibilidad y GTIN aprobado tienen cobertura específica. |
| Validación sintáctica multimedia | VERDE | product-media.js incluido en test:enterprise. |
| Protección obligatoria de main | ÁMBAR GITHUB | La rama main sigue sin ruleset/protection obligatorio. Requiere permisos administrativos. |

## 5. DEPENDENCIAS EXTERNAS QUE NO PUEDEN MARCARSE VERDE SIN EVIDENCIA

1. **Redsys producción**: las credenciales actuales son de pruebas. Mantener `REDSYS_ENV=test` y `COMMERCE_LIVE=false` en el dominio público hasta recibir credenciales reales y ejecutar una compra bancaria real de importe bajo.
2. **Netlify producción**: confirmar con acceso al proveedor que `nutretium.com` sirve exactamente el SHA aprobado por los Quality Gates. El código dispone de comprobador automático cuando están presentes las variables del despliegue.
3. **Resend/email**: verificación iniciada; el dominio continúa `pending` y los registros DKIM/SPF/CNAME siguen pendientes en DNS. Tras publicarlos debe completarse una prueba real de entrega.
4. **Transportista**: proveedor, tarifa, zonas, SLA y credenciales/API reales para etiquetas y tracking.
5. **Stock físico**: completar cantidades reales de referencias no documentadas. El Merchant feed ya excluye stock desconocido.
6. **Fotografías**: incorporar fotos propias o packshots autorizados de las referencias pendientes.
7. **PIM regulatorio**: EAN/GTIN, ingredientes, nutrición, alérgenos, advertencias y documentación real por SKU. El sistema no inventa estos datos.
8. **TPVsol**: Software DELSOL ofrece acceso API para integrar e-commerce con datos alojados; falta habilitación/credencial real de la cuenta y prueba web ↔ TPVsol antes de marcarlo operativo.
9. **Google Merchant Center/Shopping**: feed técnico disponible y endurecido; alta, revisión, destino y aprobación pertenecen a Google y requieren cuenta/acceso real.
10. **Suscripciones reales**: falta proveedor de cobro recurrente/tokenización y credenciales reales; el worker permanece fail-closed si no existen.
11. **Protección de main**: ruleset obligatorio administrado desde GitHub. El conector actual no dispone de permiso Administration.

## 6. REGLA DE VERDE

Un punto solo pasa a VERDE si cumple una de estas condiciones:

- Código implementado + prueba automatizada correspondiente en verde.
- Configuración externa verificada mediante evidencia del servicio.
- Dato comercial/regulatorio aportado por fuente real y trazable.
- Flujo de producción probado de extremo a extremo cuando interviene un tercero (banco, correo, transportista, TPV, Google).

No se marcará como VERDE por suposición, demo, placeholder, dato inventado o por el simple hecho de que exista una pantalla.

## 7. CAMBIOS DE ESTA REVISIÓN

- Gift cards verificadas como método de pago parcial/total en checkout con liquidación solo tras PAID e idempotencia.
- Fidelización verificada: canje, acumulación y configuración comercial separadas.
- Referidos verificados: bloqueo de autorreferido, descuento configurable, conversión y recompensa idempotentes.
- Merchant feed endurecido: no publica stock desconocido y solo emite GTIN desde contenido aprobado.
- Añadidas pruebas específicas de beneficios comerciales y Merchant feed al Enterprise Gate.
- Readiness externo incorporado para comprobar despliegue, correo, pagos, envío y TPV sin exponer secretos.
- Resend revalidado; continúa pendiente de publicación/propagación de DNS.
- Confirmada por documentación oficial la disponibilidad de API de Software DELSOL para integraciones e-commerce; la credencial/habilitación de la cuenta sigue externa.
- Creada copia de seguridad `backup/pre-cierre-pendientes-2026-09-20` antes de esta ronda de cambios.

## 8. ESTADO FINAL DE CIERRE

**Código cerrable desde repositorio:** debe superar los Quality Gates sobre el SHA exacto de esta revisión antes de fusionarse a `main`.

**Comercio real:** no se considerará totalmente verde mientras existan dependencias del apartado 5. En particular, Redsys debe continuar bloqueado para producción mientras las credenciales sean de prueba, y ninguna integración externa se declarará operativa sin evidencia real.
