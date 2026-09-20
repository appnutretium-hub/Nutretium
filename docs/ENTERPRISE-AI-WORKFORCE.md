# Nutretium Enterprise AI Workforce

## Objetivo

Esta capa convierte Nutretium Nexus en una organización IA jerárquica inspirada en una multinacional moderna. No copia una empresa concreta ni pretende que exista un organigrama universal: cada multinacional cambia según sector, país y tamaño. El modelo cubre las funciones corporativas y operativas que Nutretium puede necesitar al escalar.

## Principios obligatorios

1. Un puesto IA tiene misión, responsabilidades, KPIs, scopes, jefe funcional y límites de autonomía.
2. Ningún puesto puede darse permisos, cambiar su propia política, revelar secretos o desactivar controles.
3. Acciones laborales, financieras, legales, de seguridad, food-safety, producción y cambios irreversibles requieren aprobación humana.
4. Auditoría, Compliance/Food Safety, Seguridad, Finanzas, Legal, Enterprise Risk y Procurement Finance mantienen independencia y capacidad de veto según política.
5. Las tareas repetibles y reversibles pueden automatizarse; las decisiones críticas no.
6. Toda salida factual debe conservar trazabilidad y distinguir DATO VERIFICADO, INFERENCIA, ESTIMACIÓN, RECOMENDACIÓN y NO VALIDADO.
7. La web y los flujos de comercio deben continuar funcionando aunque la capa IA falle.

## Familias corporativas

- Dirección General
- Estrategia & Desarrollo Corporativo
- Finanzas
- People & RRHH
- Legal, Riesgo & Auditoría
- Tecnología & Plataforma
- Datos & IA
- Producto & Innovación
- Ventas & Revenue
- Marketing & Growth
- Cliente & Experiencia
- Supply Chain, Compras & Logística
- Operaciones & Retail
- Ecommerce & Canales Digitales
- Ciberseguridad & Resiliencia
- Calidad, Food Safety & Regulatory
- Expansión, Franquicia & Partnerships
- ESG & Sostenibilidad

## Jerarquía

El árbol parte de `chief_executive`. Cada puesto usa `reportsTo` para definir la cadena de mando. El runtime valida que no existan managers inexistentes ni ciclos jerárquicos.

Los niveles disponibles son:

`BOARD -> C_SUITE -> SVP -> VP -> DIRECTOR -> MANAGER -> LEAD -> SPECIALIST -> ANALYST -> OPERATOR`

No todos los niveles tienen que existir en cada familia. El diseño evita crear capas vacías sólo para aparentar tamaño.

## Cómo trabaja un empleado IA

Cada puesto recibe un contrato de trabajo lógico:

- `mission`: para qué existe.
- `responsibilities`: qué debe hacer.
- `kpis`: cómo se mide.
- `scopes`: qué datos/herramientas puede usar.
- `autonomous`: tareas de bajo riesgo que puede ejecutar sin autorización adicional.
- `sensitive`: tareas que requieren aprobación.
- `reportsTo`: responsable funcional.
- `family`: departamento/familia.
- `level`: nivel jerárquico.

Ejemplo conceptual:

```text
Customer Support IA
  -> lee pedidos y catálogo
  -> clasifica un caso
  -> prepara respuesta
  -> puede consultar estado de pedido
  -> NO puede reembolsar ni cambiar una cuenta sin aprobación
```

## Segregación de funciones

El agente que propone una acción crítica no debe ser el mismo mecanismo que la autoriza.

Ejemplos:

```text
Procurement Manager IA
  -> prepara pedido
Procurement Finance IA
  -> valida presupuesto/TCO
Compliance IA
  -> valida proveedor/producto cuando aplique
Owner/Admin
  -> autoriza acción crítica
Audit Ledger
  -> registra evidencia
```

```text
Frontend Engineer IA
  -> prepara parche
QA IA
  -> valida regresión
AppSec IA
  -> revisa seguridad
Release Manager IA
  -> valida readiness
Owner/Admin / gate autorizado
  -> autoriza merge/deploy según política
```

## Integración con Nutretium

`netlify/lib/enterprise-workforce.js` contiene la definición ejecutable.

`netlify/lib/agent-governance.js` integra esos puestos con los agentes existentes y expone una política única.

`netlify/functions/workforce-status.js` expone el registro y organigrama únicamente a personal autorizado con `platform.read`.

`scripts/test-enterprise-workforce.js` comprueba estructura, KPIs, scopes, jerarquía y que ninguna acción crítica se haya marcado como autónoma.

## Autonomía

La autonomía se incrementará por evidencia, no por jerarquía. Un C-suite IA no recibe permisos técnicos ilimitados por ser C-suite.

- R1: autónomo, bajo riesgo y reversible.
- R2: operación reversible gobernada.
- R3: aprobación de responsable.
- R4: aprobación de propietario/administrador.
- R5: prohibido para ejecución autónoma.

## Alcance real

Esta arquitectura crea los puestos, líneas de mando, contratos y políticas. Un puesto sólo puede ejecutar trabajo real cuando sus fuentes y herramientas están conectadas. Por ejemplo, Treasury IA necesita datos financieros; Demand Planning IA necesita ventas/stock; Customer Support IA necesita pedidos; Supplier Quality IA necesita documentación de proveedor.

La ausencia de una integración nunca se transforma en un dato inventado: el resultado debe quedar `NO VALIDADO` o limitado a propuesta/análisis.
