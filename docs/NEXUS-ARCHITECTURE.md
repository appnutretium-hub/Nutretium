# Nutretium Nexus

Nutretium Nexus unifica el control plane empresarial existente con una arquitectura modular de 40 componentes. El objetivo es permitir crecimiento progresivo sin convertir la tienda en una red de agentes acoplados entre sí.

## Principios

- El comercio debe seguir funcionando aunque la capa de IA no esté disponible.
- Los agentes operan con mínimo privilegio y no pueden elevar sus propios permisos.
- Las acciones críticas pasan por Decision Engine, Policy Engine, AI Evaluator y auditoría.
- Los datos no verificados no se convierten en hechos.
- Los flujos deterministas se implementan como workflows; la IA se reserva para decisiones acotadas.
- Las acciones con impacto financiero se someten a un presupuesto explícito.
- Guardian puede contener fallos, pero ninguna IA puede desactivar Guardian, auditoría o el veto de compliance.
- Los escenarios del Digital Twin son estimaciones, nunca hechos ni garantías.

## Capas

1. Cognitive Core: percepción, memoria, World Model, planificación y coordinación.
2. Orchestration: Event Nervous System, Workflow Engine y Agent Mesh.
3. Commerce & Customer: catálogo, búsqueda, ranking, recomendaciones, fulfillment, identidad y membresía.
4. Growth & Analytics: experimentación, CLV, forecasting y simulación.
5. Operations & Finance: supply chain, marketplace readiness, wallet contract y Financial Governor.
6. Data: Data Lakehouse, Knowledge Graph y Feature Store.
7. Reliability & Security: Guardian, Chaos Engine, células, Zero Trust y control/data plane.
8. Governance: Truth Engine, Decision Engine, Agent Registry, AI Evaluator y Audit Ledger.

La definición ejecutable y el grafo de dependencias viven en `netlify/lib/nexus-core.js`. El endpoint privado `netlify/functions/nexus-status.js` expone el estado gobernado a personal con `platform.read`. La suite `scripts/test-nexus-core.js` bloquea regresiones estructurales.