# Auditoría final del proyecto Nutretium — guía de corrección para evaluación

Fecha de revisión: 23-09-2026

## Objetivo

Este documento separa claramente lo que está corregido y verificable en el repositorio de lo que todavía exige evidencia externa. No se considera `VALIDADO` ningún punto sin prueba técnica o evidencia del servicio real.

Estados usados:

- ✅ VALIDADO
- ⚠️ PENDIENTE DE VALIDACIÓN
- ❌ ERROR
- ⛔ BLOQUEADO POR EVIDENCIA EXTERNA
- ℹ️ NO APLICA

## 1. Correcciones técnicas incluidas en el cierre

| Área | Problema detectado | Corrección aplicada | Criterio de aceptación | Estado |
|---|---|---|---|---|
| Rutas | `/recomendador` tenía destinos distintos en `_redirects` y `netlify.toml` | Se unifica con la ruta canónica `/smart-shop.html` | El auditor no detecta rutas contradictorias y el destino existe | ✅ VALIDADO |
| Storage | El auditor anterior exigía `connectBlobs(event)` en Functions que consumen persistencia mediante la fachada de almacenamiento | Se valida la arquitectura real: `storage.js` como fachada y `netlify-blobs-runtime.js` como adaptador de compatibilidad | `Repository-wide programming integrity` debe pasar sin exigir modificaciones masivas incorrectas | ✅ VALIDADO |
| Encapsulación | Riesgo de bypass mediante imports directos de `@netlify/blobs` | El auditor bloquea imports directos fuera de los adaptadores autorizados | Cualquier bypass nuevo hace fallar el Quality Gate | ✅ VALIDADO |
| Functions programadas | No existía una comprobación consolidada de que todas las Functions declaradas en `netlify.toml` existieran | El auditor comprueba las Functions con `schedule` | Una Function programada inexistente hace fallar CI | ✅ VALIDADO |
| CI | El cierre debía ser verificable antes de integrar | El Full Quality Gate incorpora el nuevo auditor y soporte de `merge_group` | Un cambio no apto no debe poder considerarse válido por CI | ✅ VALIDADO EN CÓDIGO |
| Navegación/E2E | La cobertura crítica era desigual entre motores | La auditoría interactiva crítica se ejecuta en Chromium, Firefox y WebKit | Los tres motores deben terminar en verde sobre el mismo SHA | ⚠️ PENDIENTE DEL RUN FINAL |

## 2. Controles que deben permanecer en verde

Antes de integrar el cierre, el mismo SHA debe superar:

1. instalación limpia con `npm ci`;
2. build equivalente a producción;
3. tests core y enterprise;
4. regresiones AI/Nexus/workforce/federation;
5. syntax hardening;
6. integridad global del repositorio;
7. auditoría de controles interactivos y navegación local;
8. auditorías de arquitectura y seguridad;
9. auditoría de confianza del HTML final;
10. arranque del storefront estático;
11. E2E Chromium;
12. E2E Firefox;
13. E2E WebKit;
14. Reliability Control Plane;
15. Password Recovery Gate;
16. FACTUSOL Integration Gate;
17. AI Corporation Gate;
18. Guardian Gate.

Si cualquiera falla, el proyecto vuelve a estado ⚠️/❌ hasta reproducir y corregir el fallo.

## 3. Pendientes que NO deben falsearse desde código

### Protección de `main`

La rama `main` debe quedar protegida mediante ruleset/branch protection para impedir actualizaciones sin Quality Gates. Esta configuración es administrativa de GitHub y no debe simularse con un archivo del repositorio.

Estado: ⛔ BLOQUEADO POR CONFIGURACIÓN ADMINISTRATIVA.

### `SECRETS_SCAN_OMIT_KEYS = "ADMIN_EMAILS"`

No debe retirarse todavía sin comprobar primero que `ADMIN_EMAILS` corresponde a una cuenta privada de administración y que el escaneo de secretos puede operar sin excepciones. El propio proyecto exige esa evidencia antes de retirar la excepción.

Estado: ⛔ BLOQUEADO POR EVIDENCIA DE PRODUCCIÓN.

### CSP

La política de seguridad actual mantiene `unsafe-inline` para scripts/estilos. No debe eliminarse de forma masiva sin inventariar todas las dependencias inline y demostrar mediante E2E que la migración a nonces/hashes o recursos externos no rompe la interfaz.

Estado: ⚠️ HARDENING PENDIENTE, NO ES CORRECTO ROMPER LA WEB PARA MEJORAR UNA CABECERA.

### Redsys producción

Los tests no sustituyen una operación bancaria real. Es obligatorio comprobar: checkout → Redsys producción → autorización → callback firmado → pedido `PAID` → persistencia → stock → Back Office → emails.

Estado: ⛔ BLOQUEADO POR PRUEBA REAL.

### Email real / Resend

Debe existir remitente/dominio verificado y comprobarse entrega real a cliente y negocio.

Estado: ⛔ BLOQUEADO POR SERVICIO EXTERNO.

### TPVsol/FACTUSOL real

El gate de integración valida el software disponible, pero no demuestra sincronización real hasta disponer del canal/API/exportación soportada y credenciales/configuración reales.

Estado: ⛔ BLOQUEADO POR INTEGRACIÓN EXTERNA.

### Envíos

Proveedor, zonas, tarifas, IVA, umbral gratuito, SLA y credenciales deben proceder del negocio. No se deben inventar.

Estado: ⛔ BLOQUEADO POR DATOS DEL NEGOCIO.

### Catálogo y compliance

No se deben inventar GTIN/EAN, stock, ingredientes, alérgenos, nutrición, claims ni imágenes/licencias. Cada SKU debe cerrarse con documentación real y trazable.

Estado: ⛔ BLOQUEADO POR DATOS Y DOCUMENTACIÓN REAL.

### Accesibilidad manual

Los tests automáticos no sustituyen teclado, foco, zoom, lector de pantalla y revisión humana de flujos críticos.

Estado: ⚠️ PENDIENTE DE VALIDACIÓN MANUAL.

## 4. Qué debe aprender el alumno

La corrección profesional no consiste en modificar archivos hasta que “parezca funcionar”. El flujo correcto es:

**inventario → reproducción del fallo → causa raíz → cambio mínimo → tests → regresión → validación multinavegador → revisión de seguridad → evidencia → merge controlado → smoke de producción → rollback disponible.**

Un test equivocado también es un defecto. En este proyecto el ejemplo principal fue el auditor que exigía `connectBlobs(event)` de forma indiscriminada: la solución correcta era reparar el criterio de auditoría para que entendiera la arquitectura de almacenamiento, no modificar decenas de Functions sanas para satisfacer un falso positivo.

## 5. Criterio de proyecto perfectamente terminado

### Cierre técnico del código

Puede marcarse ✅ únicamente cuando todos los gates del mismo SHA estén verdes y no queden errores reproducibles del repositorio.

### Cierre de producción comercial

Además del cierre técnico, requiere evidencia real de:

- SHA correcto desplegado en producción;
- `system-health` preparado;
- secretos/configuración real verificados;
- Redsys real de extremo a extremo;
- emails reales;
- stock/compliance del catálogo;
- shipping si se activa;
- TPVsol si se declara sincronizado;
- protección efectiva de `main`;
- accesibilidad manual final;
- procedimiento de rollback probado.

Hasta entonces debe hablarse de **proyecto técnicamente avanzado y controlado**, no de “100 % terminado”.