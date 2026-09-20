# Nutretium AI Corporation — contrato de arquitectura

## Objetivo

Nutretium AI Corporation coordina una plantilla de agentes especializados sobre una única Truth Layer. El sistema prioriza crecimiento medible, margen, rotación, recurrencia, calidad, cumplimiento y seguridad sin convertir inferencias en hechos.

## Flujo de decisión

1. Recolección desde fuentes internas conectadas.
2. Evaluación de frescura, completitud y trazabilidad.
3. Snapshot corporativo compartido por todos los agentes del ciclo.
4. Análisis especializado por departamento.
5. Separación DATO / INFERENCIA / ESTIMACIÓN / RECOMENDACIÓN.
6. Auditoría y evaluación de riesgo.
7. Vetos de Data Quality, Food Safety/Compliance, Finanzas o Seguridad cuando corresponda.
8. Acción autónoma solo si está explícitamente clasificada como bajo riesgo.
9. Aprobación humana para cualquier acción sensible.
10. Registro del resultado y aprendizaje operacional.

## Plantilla

La plantilla gobernada contiene 35 agentes distribuidos en Dirección, Comercial, Supply Chain, Operaciones, Producto, Finanzas, Growth, Clientes, Control, Tecnología, Datos, People, ESG y Expansión.

## Coste de IA

`AI_EXTERNAL_SPEND_LIMIT_EUR=0` es una restricción técnica del runtime. El modo predeterminado `deterministic` no llama a APIs generativas de pago. `ollama_gateway` solo puede usarse mediante HTTPS autenticado y mantiene el límite externo en cero.

Esto no implica que hosting, electricidad, conectividad o hardware sean gratuitos. Esos costes pertenecen a infraestructura, no a consumo de tokens del runtime.

## Límites de autonomía

Nunca son autónomos: pagos, reembolsos, configuración de pagos, precios, descuentos, envío/aprobación de compras, aprobación/bloqueo de productos o claims, liberación/retirada de lotes, cambios de personal o permisos, secretos, políticas, integraciones, despliegues, merges de código, contratos, aceptación de riesgos, altas/bloqueos de proveedores, publicación de marketplace y mensajes a clientes.

## Memoria

- `fact`: empieza `pending_validation`; solo puede promoverse con evidencia `VALIDADO` y fuentes explícitas.
- `operational`: registra lo que hizo el sistema.
- `strategic`: conserva objetivos y políticas aprobadas.
- `learning`: conserva resultados/observaciones sin convertirlos en hechos automáticamente.

## Privacidad

El gateway de modelo recibe un `businessView` agregado y resumido. El runtime no envía las colecciones crudas de clientes al modelo. Los agentes de CRM/cliente tienen instrucción explícita de no inferir atributos sensibles.

## Dependencias externas no simuladas

La arquitectura no inventa conectividad. Hasta que cada integración sea documental y técnicamente validada, se mantiene `NO_VALIDADO`:

- TPVsol / stock físico en tiempo real.
- Ollama local: requiere un runner y gateway HTTPS autenticado accesible desde Netlify.
- Proveedores: tarifas, lead times, MOQ y documentación reales.
- Fuentes externas de demanda/tendencias.
- Transporte/logística cuando no exista integración activa.
- Redsys producción: no se activa desde AI Corporation.

## Operación diaria

El worker de IA ejecuta una tarea autónoma por cada agente utilizando un único snapshot corporativo por ciclo. La ejecución completa también puede lanzarse manualmente desde `/ai-corporation` por propietario/administrador.

## Regla de seguridad

Una ausencia de datos nunca se rellena como hecho. Una acción crítica nunca se ejecuta solo porque un modelo la recomiende. El sistema debe fallar de forma segura y conservar la trazabilidad de decisión.
