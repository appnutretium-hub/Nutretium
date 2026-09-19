# Seguridad de Nutretium

Este repositorio contiene código de ecommerce, autenticación, administración, pagos e integraciones. No publiques credenciales, tokens, claves bancarias, secretos de sesión ni datos personales en issues, commits o pull requests.

## Reporte de vulnerabilidades

Si detectas una vulnerabilidad, comunícala de forma privada al propietario del repositorio. Incluye únicamente la información necesaria para reproducir el problema y evita adjuntar datos reales de clientes o secretos.

## Principios operativos

- Los secretos se configuran en el proveedor de despliegue y nunca se versionan.
- Las rutas administrativas deben fallar cerrado si falta autenticación, autorización o almacenamiento crítico.
- Los cambios sensibles deben pasar los quality gates antes de llegar a `main`.
- Las restauraciones deben validarse antes de escribir datos y generar una copia de seguridad previa.
- Las credenciales deben tener privilegio mínimo y poder revocarse de forma independiente.

## Incidentes

Ante una posible exposición de credenciales: revocar primero la credencial afectada, generar una nueva, revisar logs/auditoría y validar el despliegue antes de reabrir el servicio afectado.
