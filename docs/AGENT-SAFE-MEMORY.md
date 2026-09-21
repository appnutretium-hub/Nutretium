# Nutretium Agent Safe Memory

## Objetivo

Cada empleado IA trabaja sobre una copia aislada y sólo puede convertirla en memoria estable después de superar controles deterministas. La memoria estable nunca se modifica directamente por el agente.

## Flujo

`VERIFIED CHECKPOINT -> SHADOW -> WORK -> VERIFY -> PROMOTE -> SIGN -> MIRROR -> RECOVERY CHECK`

Si falla cualquier control, la versión verificada anterior continúa siendo la referencia.

## Estado por agente

- `agent-checkpoint-heads`: puntero al checkpoint vigente.
- `agent-checkpoints`: generaciones verificadas e inmutables lógicamente.
- `agent-shadow-workspaces`: copias de trabajo.
- `agent-promotion-locks`: un único promotor por checkpoint base.
- `agent-recovery-journal`: eventos de recuperación y promoción.
- `agent-checkpoint-signatures`: firma HMAC de autenticidad.
- `agent-memory-quarantine`: aislamiento operativo.
- `agent-memory-peer-reviews`: revisión independiente previa a memoria estable.
- `agent-checkpoint-backup-v1`: mirror append-only en un store de Blob separado.

## Reglas de promoción

Una ejecución sólo puede alimentar memoria estable cuando:

1. termina `COMPLETED`;
2. queda `VALIDADO` por Truth Layer;
3. no requiere decisión humana;
4. no tiene fuentes requeridas ausentes;
5. no solicita gasto externo;
6. supera revisión independiente de control;
7. el agente no está en cuarentena;
8. el shadow conserva el mismo fingerprint de permisos/política;
9. el hash del shadow y del checkpoint base es correcto;
10. el checkpoint base sigue siendo el vigente.

Las promociones son idempotentes: reintentar el mismo shadow devuelve el checkpoint ya promovido. Un shadow distinto que compita por la misma base queda bloqueado.

## Integridad y autenticidad

- Estado: SHA-256.
- Política/permisos: `profileHash`.
- Cadena: cada checkpoint referencia `previousCheckpointId`.
- Autenticidad: HMAC-SHA256 con subclave derivada para el dominio `nutretium-agent-memory-v1`.
- La subclave usa `AGENT_MEMORY_HMAC_KEY`; si no existe, el runtime utiliza `JWT_SECRET` como raíz y deriva una clave independiente.
- La clave nunca se guarda dentro de la memoria del agente.

## Backup y recuperación

Cada promoción válida se replica a `agent-checkpoint-backup-v1` con `onlyIfNew` y se vuelve a calcular el hash del contenido replicado.

El simulacro de recuperación comprueba:

- cadena primaria;
- hash del backup;
- firma HMAC;
- capacidad de reconstruir el estado serializado del backup.

Un fallo real de integridad puede activar cuarentena.

## Cuarentena

Un agente en cuarentena:

- no ejecuta trabajo del Workforce;
- no promociona memoria;
- permanece visible para auditoría y recuperación;
- sólo puede ser liberado por `owner` o `admin`.

El rollback no borra historia: crea una nueva generación basada en un checkpoint histórico.

## Gestión de crecimiento

La memoria privada contiene como máximo una ventana activa por bucket. El lifecycle calcula `confidenceWeight` con decay temporal y puede compactar memoria de forma determinista, conservando un manifiesto hash de los elementos retirados de la ventana activa.

Los hechos validados envejecen más lentamente que hipótesis/aprendizajes. El decay no convierte datos no validados en hechos.

## Presupuesto operativo

El worker de Workforce conserva el modo Zero-Cost y aplica presupuesto global de ejecución. Si el tiempo disponible se agota, detiene promociones adicionales antes del límite de la función en lugar de comprar capacidad o forzar una ejecución incompleta.

## Autoridad

Los agentes nunca pueden:

- autoaprobar acciones críticas;
- borrar backups;
- liberar su propia cuarentena;
- modificar secretos;
- cambiar sus permisos;
- alterar evidencia de validación;
- sobrescribir directamente un checkpoint verificado.

## Validación

Los tests relevantes son:

- `scripts/test-agent-safe-memory.js`
- `scripts/test-agent-memory-extreme.js`
- `scripts/test-enterprise-workforce-runtime.js`
- `scripts/test-zero-cost-policy.js`
- `scripts/test-ai-federation.js`

Todos forman parte del Full Quality Gate. La fusión debe permanecer bloqueada mientras GitHub Actions no ejecute realmente los pasos del gate.
