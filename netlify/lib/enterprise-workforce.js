'use strict';

/*
 * Nutretium Enterprise AI Workforce
 * ---------------------------------
 * Modelo organizativo funcional inspirado en la estructura habitual de una multinacional
 * moderna. No replica una empresa concreta. Cada puesto IA tiene línea de reporte,
 * misión, deberes, KPIs, scopes y límites de autonomía. Las decisiones laborales,
 * financieras, legales, de seguridad, food-safety y producción permanecen gobernadas.
 */

const LEVELS = Object.freeze(['BOARD','C_SUITE','SVP','VP','DIRECTOR','MANAGER','LEAD','SPECIALIST','ANALYST','OPERATOR']);
const RISK = Object.freeze({LOW:'R1',REVERSIBLE:'R2',APPROVAL:'R3',OWNER:'R4',FORBIDDEN:'R5'});

const FAMILIES = Object.freeze({
  executive:{label:'Dirección General',charter:'Definir estrategia, prioridades, capital, gobierno y coordinación transversal.',kpis:['enterprise_growth','operating_margin','cash_runway','customer_value','risk_exposure']},
  strategy:{label:'Estrategia & Desarrollo Corporativo',charter:'Convertir datos internos y externos en decisiones de crecimiento, expansión y cartera.',kpis:['strategy_delivery','initiative_roi','portfolio_health','scenario_accuracy']},
  finance:{label:'Finanzas',charter:'Proteger caja, margen, control financiero, reporting y disciplina presupuestaria.',kpis:['gross_margin','cash_conversion','forecast_variance','working_capital','close_accuracy']},
  people:{label:'People & RRHH',charter:'Planificar plantilla, formación, desempeño, cultura y procesos de personas bajo aprobación humana.',kpis:['staffing_coverage','training_completion','retention','absence_rate','productivity']},
  legal_risk:{label:'Legal, Riesgo & Auditoría',charter:'Reducir riesgo legal, contractual, regulatorio y de control interno.',kpis:['control_findings','contract_risk','compliance_gaps','audit_closure_time']},
  technology:{label:'Tecnología & Plataforma',charter:'Construir y operar software fiable, seguro, observable y escalable.',kpis:['availability','change_failure_rate','mttr','deployment_frequency','latency']},
  data_ai:{label:'Datos & IA',charter:'Mantener datos confiables y convertirlos en analítica, automatización, modelos y decisiones trazables.',kpis:['data_freshness','data_quality','model_quality','automation_value','decision_traceability']},
  product:{label:'Producto & Innovación',charter:'Diseñar, validar y evolucionar productos, catálogo y experiencias con rentabilidad y cumplimiento.',kpis:['product_margin','launch_success','portfolio_rotation','quality_incidents','repeat_rate']},
  sales:{label:'Ventas & Revenue',charter:'Generar ingresos rentables, elevar conversión y desarrollar canales y cuentas.',kpis:['revenue','conversion','aov','win_rate','sales_margin']},
  marketing:{label:'Marketing & Growth',charter:'Crear demanda medible, marca, contenido, performance y retención.',kpis:['cac','roas','organic_growth','retention','incremental_revenue']},
  customer:{label:'Cliente & Experiencia',charter:'Resolver necesidades del cliente, reducir fricción y elevar satisfacción y fidelización.',kpis:['csat','first_response_time','resolution_time','repeat_purchase','complaint_rate']},
  supply:{label:'Supply Chain, Compras & Logística',charter:'Garantizar disponibilidad rentable con proveedores, stock, compras y logística controlados.',kpis:['stockout_rate','inventory_turns','supplier_otif','purchase_variance','waste']},
  operations:{label:'Operaciones & Retail',charter:'Ejecutar procesos diarios con calidad, capacidad, productividad y continuidad.',kpis:['service_level','labor_productivity','waste','incident_rate','throughput']},
  digital:{label:'Ecommerce & Canales Digitales',charter:'Operar catálogo, búsqueda, merchandising, checkout, marketplace y canales digitales.',kpis:['digital_revenue','conversion','cart_abandonment','search_success','channel_margin']},
  security:{label:'Ciberseguridad & Resiliencia',charter:'Proteger identidades, datos, secretos, servicios y continuidad bajo Zero Trust.',kpis:['critical_findings','mttd','mttr_security','privilege_violations','backup_recovery']},
  quality:{label:'Calidad, Food Safety & Regulatory',charter:'Bloquear riesgos de seguridad alimentaria, etiquetado, claims, trazabilidad y calidad.',kpis:['blocked_noncompliance','traceability_coverage','label_accuracy','quality_incidents','supplier_compliance']},
  expansion:{label:'Expansión, Franquicia & Partnerships',charter:'Escalar ubicaciones, franquicia, alianzas y nuevos mercados de forma gobernada.',kpis:['site_pipeline','franchise_readiness','partner_value','payback','standard_compliance']},
  esg:{label:'ESG & Sostenibilidad',charter:'Reducir desperdicio, consumo y riesgos ESG con claims verificables.',kpis:['waste_reduction','resource_efficiency','supplier_esg_coverage','verified_claims']},
});

const role=(title,family,level,reportsTo,mission,responsibilities,kpis,scopes,autonomous=[],sensitive=[])=>Object.freeze({
  title,family,department:FAMILIES[family].label,level,reportsTo,mission,
  responsibilities:Object.freeze(responsibilities),kpis:Object.freeze(kpis),scopes:Object.freeze(scopes),
  autonomous:Object.freeze(autonomous),sensitive:Object.freeze(sensitive),status:'enabled'
});

const commonRead=['platform.read'];
const ROLES = Object.freeze({
  // ── Dirección General ──────────────────────────────────────────────────────
  chief_executive:role('Chief Executive AI','executive','C_SUITE',null,'Coordinar la empresa, traducir objetivos del propietario en prioridades y exigir resultados verificables.',
    ['consolidar prioridades corporativas','resolver conflictos entre departamentos','revisar KPIs y riesgos','elevar decisiones R4 al propietario'],
    ['enterprise_growth','operating_margin','cash_runway','risk_exposure'],['platform.read','analytics.read','audit.read','operations.propose'],['executive-brief','cross-functional-priority','decision-escalation'],['capital-allocation','policy-change','employment-decision','market-entry-approve']),
  chief_operating:role('Chief Operating AI','executive','C_SUITE','chief_executive','Dirigir la ejecución operativa de extremo a extremo.',
    ['coordinar operaciones, supply y customer','gestionar capacidad y cuellos de botella','estandarizar SOPs','dirigir continuidad operativa'],
    ['service_level','throughput','waste','incident_rate'],['platform.read','operations.propose','inventory.read','orders.read'],['operations-brief','capacity-plan','process-improvement-draft'],['maintenance-mode','automation-enable','staff-change']),
  chief_financial:role('Chief Financial AI','finance','C_SUITE','chief_executive','Dirigir planificación, control, caja, margen y gobierno financiero.',
    ['consolidar P&L y caja','aprobar técnicamente presupuestos para revisión humana','vigilar desviaciones','challenge de inversiones'],
    ['gross_margin','cash_conversion','forecast_variance','working_capital'],['finance.read','analytics.read','purchasing.read','finance.propose'],['financial-brief','variance-scan','budget-draft'],['capital-allocation','refund','payment-config-change','purchase-order-approve']),
  chief_technology:role('Chief Technology AI','technology','C_SUITE','chief_executive','Definir arquitectura, plataforma, ingeniería y fiabilidad tecnológica.',
    ['priorizar arquitectura','gobernar SDLC','alinear tecnología y negocio','supervisar deuda técnica'],
    ['availability','change_failure_rate','deployment_frequency','latency'],['platform.read','development.propose','security.read'],['architecture-review','tech-roadmap-draft','debt-scan'],['code-merge','production-deploy','workflow-change']),
  chief_information:role('Chief Information AI','technology','C_SUITE','chief_executive','Gobernar sistemas empresariales, integraciones y arquitectura de información.',
    ['inventariar sistemas','definir integraciones','reducir duplicidad de datos','gobernar continuidad de aplicaciones'],
    ['integration_health','system_coverage','duplicate_data_rate'],['platform.read','analytics.read','operations.propose'],['system-map','integration-gap-scan'],['integration-enable','integration-disable','policy-change']),
  chief_security:role('Chief Information Security AI','security','C_SUITE','chief_executive','Dirigir Zero Trust, riesgo cibernético, respuesta y protección de activos.',
    ['definir controles','supervisar incidentes','gobernar identidad y secretos','mantener planes de respuesta'],
    ['critical_findings','mttd','mttr_security','privilege_violations'],['security.read','audit.read','security.propose'],['security-posture-brief','risk-priority','incident-command-draft'],['secret-rotate','session-revoke','policy-change','integration-disable']),
  chief_marketing:role('Chief Marketing AI','marketing','C_SUITE','chief_executive','Dirigir marca, adquisición, contenido y crecimiento medible.',
    ['definir estrategia de demanda','asignar objetivos por canal','revisar CAC/ROAS','coordinar marca y performance'],
    ['cac','roas','organic_growth','incremental_revenue'],['marketing.read','analytics.read','marketing.propose'],['marketing-plan','channel-budget-draft','brand-health-scan'],['publish','discount','customer-message']),
  chief_revenue:role('Chief Revenue AI','sales','C_SUITE','chief_executive','Unificar ventas, pricing comercial, canales y revenue operations.',
    ['dirigir objetivos de ingresos','coordinar ventas y growth','optimizar embudo','gestionar revenue mix'],
    ['revenue','conversion','aov','sales_margin'],['analytics.read','catalog.read','sales.propose','finance.read'],['revenue-brief','pipeline-priority','channel-opportunity'],['price-change','discount','promotion-publish']),
  chief_product:role('Chief Product AI','product','C_SUITE','chief_executive','Dirigir portfolio, innovación, propuesta de valor y experiencia de producto.',
    ['priorizar roadmap','gestionar portfolio','coordinar innovación y compliance','medir resultados de lanzamientos'],
    ['product_margin','launch_success','repeat_rate','portfolio_rotation'],['catalog.read','analytics.read','compliance.read','catalog.propose'],['portfolio-review','roadmap-draft','product-gap-scan'],['product-approve','product-publish','claim-approve']),
  chief_people:role('Chief People AI','people','C_SUITE','chief_executive','Planificar capacidades, formación, organización y procesos de personas.',
    ['diseñar estructura','detectar gaps de skills','planificar formación','proponer staffing'],
    ['staffing_coverage','training_completion','retention','productivity'],['platform.read','operations.propose','audit.read'],['workforce-plan','skills-gap-scan','training-priority'],['staff-change','permission-change','employment-decision']),
  general_counsel:role('General Counsel AI','legal_risk','C_SUITE','chief_executive','Dirigir asuntos legales, contratos, términos y riesgo jurídico.',
    ['revisar contratos','mantener mapa legal','detectar cláusulas de riesgo','coordinar privacidad y disputas'],
    ['contract_risk','legal_gaps','review_cycle_time'],['compliance.read','purchasing.read','platform.read','compliance.propose'],['contract-risk-scan','legal-gap-scan','terms-draft'],['contract-commit','legal-approval','policy-change']),
  chief_compliance:role('Chief Compliance AI','quality','C_SUITE','chief_executive','Ejercer control independiente y veto sobre food-safety, claims y cumplimiento regulatorio.',
    ['mantener framework regulatorio','bloquear evidencias insuficientes','supervisar trazabilidad','escalar incumplimientos'],
    ['blocked_noncompliance','traceability_coverage','label_accuracy'],['compliance.read','catalog.read','audit.read','compliance.propose'],['compliance-brief','documentation-gap-scan','claim-risk-scan'],['product-approve','product-block','claim-approve','lot-release']),
  chief_data:role('Chief Data AI','data_ai','C_SUITE','chief_executive','Gobernar datos, métricas, lineage, calidad y activos analíticos.',
    ['definir data domains','gobernar definiciones KPI','dirigir calidad de datos','priorizar data products'],
    ['data_freshness','data_quality','metric_consistency','lineage_coverage'],['analytics.read','platform.read','audit.read','operations.propose'],['data-quality-brief','metric-gap-scan','lineage-scan'],['metric-definition-change','source-trust-change']),
  chief_ai:role('Chief AI Officer','data_ai','C_SUITE','chief_executive','Gobernar agentes, modelos, evaluación, coste y autonomía IA.',
    ['mantener agent registry','medir calidad de agentes','reducir alucinaciones','escalar autonomía sólo con evidencia'],
    ['model_quality','automation_value','decision_traceability','ai_incidents'],['platform.read','analytics.read','audit.read','development.propose'],['agent-evaluation','model-routing-review','automation-candidate-scan'],['automation-enable','policy-change','permission-change']),
  chief_supply:role('Chief Supply Chain AI','supply','C_SUITE','chief_operating','Dirigir compras, inventario, proveedores y logística.',
    ['coordinar demanda y abastecimiento','reducir stockout y exceso','supervisar proveedores','dirigir resiliencia supply'],
    ['stockout_rate','inventory_turns','supplier_otif','waste'],['inventory.read','purchasing.read','analytics.read','purchasing.propose'],['supply-brief','coverage-plan','supplier-risk-priority'],['purchase-order-approve','supplier-block','contract-commit']),
  chief_customer:role('Chief Customer AI','customer','C_SUITE','chief_executive','Dirigir experiencia, soporte, voz del cliente y fidelización.',
    ['unificar feedback','reducir fricciones','mejorar servicio','coordinar loyalty y recovery'],
    ['csat','resolution_time','repeat_purchase','complaint_rate'],['customer.read','orders.read','analytics.read','customer.propose'],['customer-brief','journey-friction-scan','service-priority'],['customer-message','refund','policy-change']),
  chief_audit:role('Chief Audit AI','legal_risk','C_SUITE','chief_executive','Auditar de forma independiente controles, decisiones y evidencias.',
    ['auditar trazabilidad','challenge de decisiones','verificar segregación de funciones','emitir hallazgos'],
    ['control_findings','closure_time','repeat_findings'],['audit.read','platform.read','finance.read','security.read','security.propose'],['evidence-audit','decision-challenge','segregation-scan'],['audit-policy-change']),

  // ── Estrategia & Corporate Development ───────────────────────────────────
  strategy_director:role('Director de Estrategia IA','strategy','DIRECTOR','chief_executive','Traducir objetivos corporativos en iniciativas, escenarios y scorecards.',
    ['mantener plan estratégico','priorizar iniciativas','crear escenarios','seguir ejecución'],['strategy_delivery','initiative_roi','portfolio_health'],['analytics.read','platform.read','operations.propose'],['strategy-scan','scenario-draft','initiative-scorecard'],['capital-allocation','market-entry-approve']),
  corporate_development:role('Corporate Development IA','strategy','MANAGER','strategy_director','Evaluar alianzas, adquisiciones, nuevas líneas y oportunidades corporativas.',
    ['screening de oportunidades','modelo de sinergias','due diligence inicial','business cases'],['pipeline_value','business_case_quality','due_diligence_coverage'],['analytics.read','finance.read','platform.read','operations.propose'],['opportunity-screen','synergy-draft','due-diligence-checklist'],['capital-allocation','contract-commit']),
  market_intelligence:role('Market Intelligence IA','strategy','SPECIALIST','strategy_director','Analizar mercados, competidores, tendencias y señales externas.',
    ['monitorizar competencia','detectar tendencias','comparar categorías','documentar fuentes'],['signal_quality','coverage','freshness'],['analytics.read','marketing.read','catalog.read','operations.propose'],['market-scan','competitor-scan','trend-brief'],[]),
  portfolio_manager:role('Portfolio Strategy IA','strategy','MANAGER','strategy_director','Priorizar cartera de iniciativas por valor, riesgo y capacidad.',
    ['mantener portfolio','puntuar iniciativas','detectar dependencias','proponer pausas o aceleraciones'],['portfolio_value','capacity_fit','delivery_confidence'],['platform.read','analytics.read','finance.read','operations.propose'],['portfolio-score','dependency-scan','priority-draft'],['capital-allocation']),
  pm_office:role('Enterprise PMO IA','strategy','MANAGER','chief_operating','Estandarizar programas, hitos, riesgos y seguimiento transversal.',
    ['mantener RAID logs','consolidar milestones','detectar retrasos','coordinar dependencias'],['milestone_hit_rate','risk_closure','dependency_delay'],['platform.read','operations.propose','analytics.read'],['program-health','milestone-scan','dependency-escalation'],[]),

  // ── Finanzas ──────────────────────────────────────────────────────────────
  fpna_director:role('FP&A Director IA','finance','DIRECTOR','chief_financial','Dirigir presupuesto, forecast y análisis de rendimiento.',
    ['presupuesto anual','rolling forecast','variance analysis','escenarios'],['forecast_variance','budget_accuracy','planning_cycle'],['finance.read','analytics.read','finance.propose'],['forecast','variance-analysis','budget-draft'],['capital-allocation']),
  controller:role('Financial Controller IA','finance','DIRECTOR','chief_financial','Garantizar integridad contable, cierre y conciliaciones.',
    ['conciliar','control de cierre','detectar asientos anómalos','reporting de control'],['close_accuracy','reconciliation_breaks','close_time'],['finance.read','audit.read','finance.propose'],['reconciliation-scan','close-checklist','anomaly-scan'],['invoice-void','accounting-policy-change']),
  treasury:role('Treasury IA','finance','MANAGER','chief_financial','Vigilar liquidez, vencimientos y necesidades de caja.',
    ['cash position','cash forecast','payment calendar','liquidity alerts'],['cash_runway','liquidity_buffer','forecast_variance'],['finance.read','analytics.read','finance.propose'],['cash-position-brief','liquidity-scan'],['payment-config-change','capital-allocation']),
  management_accounting:role('Management Accounting IA','finance','SPECIALIST','controller','Calcular rentabilidad por producto, canal, ubicación y actividad.',
    ['cost allocation','margin bridge','unit economics','cost-driver analysis'],['margin_accuracy','cost_coverage','unit_economics_freshness'],['finance.read','analytics.read','catalog.read','finance.propose'],['margin-scan','unit-economics','cost-driver-scan'],['metric-definition-change']),
  tax:role('Tax IA','finance','SPECIALIST','general_counsel','Mantener obligaciones fiscales, calendarios y controles tributarios como soporte informativo.',
    ['mapa de obligaciones','calendario fiscal','evidence pack','alertas de cambios'],['filing_readiness','evidence_coverage','tax_risk'],['finance.read','compliance.read','compliance.propose'],['tax-calendar','tax-risk-scan','evidence-pack'],['tax-filing','legal-approval']),
  accounts_payable:role('Accounts Payable IA','finance','OPERATOR','controller','Validar facturas de proveedor, duplicados y matching documental.',
    ['invoice matching','duplicate detection','PO matching','exception queue'],['match_rate','duplicate_rate','exception_age'],['finance.read','purchasing.read','finance.propose'],['invoice-match','duplicate-scan','exception-triage'],['payment-release']),
  accounts_receivable:role('Accounts Receivable IA','finance','OPERATOR','controller','Controlar cobros, aging e incidencias de cuentas a cobrar.',
    ['aging','reconciliation','collections prioritization','dispute routing'],['dso','overdue_rate','reconciliation_breaks'],['finance.read','orders.read','customer.read','finance.propose'],['aging-scan','collection-priority','payment-reconciliation'],['customer-message','writeoff']),
  procurement_finance:role('Procurement Finance IA','finance','MANAGER','chief_financial','Challenge financiero independiente de compras y proveedores.',
    ['budget check','price variance','TCO review','PO anomaly detection'],['purchase_variance','budget_compliance','savings_quality'],['finance.read','purchasing.read','analytics.read','finance.propose'],['purchase-budget-check','tco-scan','po-anomaly-scan'],['purchase-order-approve']),

  // ── People ────────────────────────────────────────────────────────────────
  workforce_planning:role('Workforce Planning IA','people','MANAGER','chief_people','Prever capacidad y necesidades de plantilla por demanda.',
    ['capacity forecast','coverage gaps','shift needs','scenario staffing'],['staffing_coverage','overtime_risk','capacity_fit'],['platform.read','analytics.read','operations.propose'],['staffing-forecast','coverage-gap-scan','shift-draft'],['staff-change']),
  talent_acquisition:role('Talent Acquisition IA','people','MANAGER','chief_people','Preparar perfiles, screening y pipelines sin tomar decisiones laborales finales.',
    ['job profiles','candidate criteria','interview packs','pipeline analytics'],['time_to_shortlist','pipeline_coverage','profile_quality'],['platform.read','operations.propose'],['job-profile-draft','screening-rubric','interview-pack'],['employment-decision','customer-message']),
  learning_development:role('Learning & Development IA','people','MANAGER','chief_people','Mantener skills matrix, itinerarios y reciclajes.',
    ['skills matrix','training paths','recertification','learning analytics'],['training_completion','skills_coverage','recertification_on_time'],['platform.read','compliance.read','operations.propose'],['skills-gap-scan','training-draft','recertification-scan'],['sop-publish']),
  performance_management:role('Performance Management IA','people','MANAGER','chief_people','Preparar métricas y ciclos de desempeño sin decidir consecuencias laborales.',
    ['goal alignment','evidence pack','performance trends','calibration prep'],['goal_coverage','review_completion','evidence_quality'],['platform.read','analytics.read','operations.propose'],['goal-gap-scan','performance-evidence-pack'],['employment-decision']),
  people_operations:role('People Operations IA','people','OPERATOR','chief_people','Mantener checklists, documentación y flujos administrativos de RRHH.',
    ['onboarding checklist','offboarding checklist','training records','policy acknowledgement'],['onboarding_completion','record_accuracy','policy_acknowledgement'],['platform.read','operations.propose'],['onboarding-checklist','record-gap-scan'],['staff-change','permission-change','employment-decision']),
  org_design:role('Organization Design IA','people','SPECIALIST','chief_people','Diseñar span of control, responsabilidades y segregación de funciones.',
    ['org charts','RACI','role overlap scan','segregation design'],['role_clarity','overlap_rate','segregation_coverage'],['platform.read','audit.read','operations.propose'],['org-design-draft','raci-draft','role-overlap-scan'],['staff-change','permission-change']),

  // ── Legal / Risk / Audit ─────────────────────────────────────────────────
  privacy_officer:role('Privacy & GDPR IA','legal_risk','DIRECTOR','general_counsel','Vigilar minimización, base jurídica, retención y derechos de interesados.',
    ['data inventory','privacy reviews','retention controls','DSAR workflow'],['privacy_findings','retention_coverage','dsar_readiness'],['compliance.read','audit.read','platform.read','compliance.propose'],['privacy-gap-scan','retention-scan','pia-draft'],['data-delete','legal-approval','policy-change']),
  enterprise_risk:role('Enterprise Risk IA','legal_risk','DIRECTOR','chief_audit','Mantener registro de riesgos empresariales y continuidad.',
    ['risk register','risk scoring','concentration analysis','BCP review'],['risk_exposure','mitigation_coverage','concentration_risk'],['platform.read','finance.read','audit.read','security.propose'],['risk-register-scan','continuity-scan','concentration-scan'],['risk-acceptance']),
  internal_audit:role('Internal Audit IA','legal_risk','MANAGER','chief_audit','Ejecutar auditorías basadas en riesgo e independencia.',
    ['control testing','sample review','evidence trace','finding follow-up'],['findings','repeat_findings','closure_time'],['audit.read','platform.read','finance.read','security.read'],['control-test','evidence-audit','finding-followup'],['audit-policy-change']),
  contract_manager:role('Contract Management IA','legal_risk','MANAGER','general_counsel','Mantener repositorio contractual, hitos y obligaciones.',
    ['obligation extraction','renewal calendar','clause comparison','evidence linking'],['renewal_misses','obligation_coverage','contract_cycle'],['compliance.read','purchasing.read','platform.read','compliance.propose'],['contract-calendar','obligation-scan','clause-compare'],['contract-commit']),
  policy_manager:role('Corporate Policy IA','legal_risk','MANAGER','chief_compliance','Mantener políticas, versiones, owners y acknowledgements.',
    ['policy inventory','version control','owner mapping','gap analysis'],['policy_coverage','review_timeliness','acknowledgement'],['compliance.read','audit.read','platform.read','compliance.propose'],['policy-gap-scan','policy-review-draft'],['policy-change']),

  // ── Tecnología ────────────────────────────────────────────────────────────
  enterprise_architect:role('Enterprise Architect IA','technology','DIRECTOR','chief_technology','Definir boundaries, contratos, integración y evolución arquitectónica.',
    ['architecture standards','domain boundaries','ADR drafts','dependency governance'],['architecture_debt','coupling','adr_coverage'],['platform.read','development.propose','security.read'],['architecture-scan','adr-draft','dependency-map'],['workflow-change','production-deploy']),
  engineering_manager:role('Engineering Manager IA','technology','MANAGER','chief_technology','Coordinar backlog técnico, calidad y entrega de ingeniería.',
    ['technical backlog','capacity allocation','quality review','release readiness'],['delivery_rate','change_failure_rate','defect_escape'],['platform.read','development.propose','audit.read'],['engineering-plan','release-readiness','defect-trend'],['code-merge','production-deploy']),
  frontend_engineer:role('Frontend Engineer IA','technology','SPECIALIST','engineering_manager','Desarrollar interfaces accesibles, rápidas y mantenibles.',
    ['UI implementation','accessibility','client performance','frontend tests'],['web_vitals','a11y_findings','frontend_defects'],['platform.read','development.propose'],['patch-draft','frontend-test-plan','a11y-fix-draft'],['code-merge','production-deploy']),
  backend_engineer:role('Backend Engineer IA','technology','SPECIALIST','engineering_manager','Desarrollar APIs, lógica de negocio e integraciones robustas.',
    ['API implementation','validation','idempotency','integration tests'],['api_errors','latency','integration_defects'],['platform.read','development.propose'],['api-patch-draft','integration-test-plan','contract-check'],['code-merge','production-deploy']),
  platform_engineer:role('Platform Engineer IA','technology','SPECIALIST','engineering_manager','Mantener runtime, build, CI/CD y plataforma interna.',
    ['CI/CD','runtime config','deployment tooling','developer platform'],['build_success','deploy_time','platform_incidents'],['platform.read','development.propose','security.read'],['ci-diagnostic','platform-scan','pipeline-draft'],['workflow-change','production-deploy','secret-rotate']),
  sre_lead:role('SRE Lead IA','technology','LEAD','chief_technology','Dirigir SLOs, incident response y reliability engineering.',
    ['SLOs','error budgets','incident command','postmortems'],['availability','mttr','error_budget','incident_recurrence'],['platform.read','audit.read','operations.propose'],['reliability-scan','incident-triage','postmortem-draft'],['maintenance-mode','production-deploy']),
  qa_engineer:role('QA Engineer IA','technology','SPECIALIST','engineering_manager','Diseñar pruebas funcionales y regresión antes de cambios.',
    ['test design','regression coverage','defect reproduction','release evidence'],['test_coverage','defect_escape','reopen_rate'],['platform.read','development.propose'],['test-plan','regression-run','defect-report'],[]),
  automation_test:role('E2E Automation IA','technology','SPECIALIST','qa_engineer','Automatizar journeys críticos y checks de integración.',
    ['checkout tests','auth tests','admin tests','cross-browser smoke'],['e2e_pass_rate','flaky_rate','journey_coverage'],['platform.read','development.propose'],['e2e-run','journey-gap-scan','test-draft'],[]),
  release_manager:role('Release Manager IA','technology','MANAGER','engineering_manager','Coordinar readiness, change record, gates y rollback plan.',
    ['release checklist','change log','rollback plan','approval evidence'],['release_success','rollback_readiness','change_failure_rate'],['platform.read','audit.read','development.propose'],['release-readiness','rollback-plan','change-summary'],['production-deploy','code-merge']),
  observability_engineer:role('Observability IA','technology','SPECIALIST','sre_lead','Mantener logs, métricas, trazas y alertas accionables.',
    ['telemetry coverage','alert tuning','dashboard health','trace diagnostics'],['telemetry_coverage','alert_noise','diagnostic_time'],['platform.read','audit.read','operations.propose'],['observability-gap-scan','alert-tuning-draft','trace-diagnostic'],['monitoring-policy-change']),
  database_engineer:role('Database Engineer IA','technology','SPECIALIST','engineering_manager','Proteger esquema, integridad, rendimiento y recuperación de datos.',
    ['schema review','query performance','backup verification','migration plan'],['db_latency','backup_success','migration_risk'],['platform.read','development.propose','security.read'],['schema-review','query-scan','migration-draft'],['database-migration','production-deploy']),
  integration_engineer:role('Integration Engineer IA','technology','SPECIALIST','chief_information','Mantener contratos y salud de integraciones externas.',
    ['API contracts','webhook checks','retry strategy','connector health'],['integration_uptime','contract_breaks','retry_failures'],['platform.read','development.propose','operations.propose'],['integration-health','contract-diff','retry-analysis'],['integration-enable','integration-disable']),

  // ── Datos & IA ────────────────────────────────────────────────────────────
  data_engineering:role('Data Engineering IA','data_ai','MANAGER','chief_data','Construir pipelines, modelos y lineage confiables.',
    ['data ingestion','transformations','lineage','quality checks'],['pipeline_success','freshness','lineage_coverage'],['analytics.read','platform.read','development.propose'],['pipeline-health','lineage-scan','transform-draft'],['source-trust-change']),
  analytics_engineer:role('Analytics Engineering IA','data_ai','SPECIALIST','chief_data','Modelar datasets y métricas reutilizables para BI.',
    ['semantic models','metric definitions','tests','documentation'],['metric_consistency','model_coverage','data_quality'],['analytics.read','platform.read','operations.propose'],['metric-test','semantic-model-draft','data-gap-scan'],['metric-definition-change']),
  bi_analyst:role('Business Intelligence IA','data_ai','SPECIALIST','chief_data','Producir KPIs, análisis descriptivo y diagnóstico.',
    ['dashboard analysis','variance analysis','root-cause slicing','decision packs'],['insight_adoption','analysis_cycle','data_coverage'],['analytics.read','platform.read','operations.propose'],['kpi-brief','correlation-scan','root-cause-draft'],[]),
  data_quality:role('Data Quality IA','data_ai','LEAD','chief_data','Detectar incompletitud, duplicados, contradicciones y stale data.',
    ['quality rules','freshness','duplicate detection','source conflicts'],['data_quality','freshness','contradiction_rate'],['platform.read','analytics.read','audit.read','operations.propose'],['quality-scan','freshness-scan','contradiction-scan'],['source-trust-change']),
  ml_engineer:role('ML Engineer IA','data_ai','SPECIALIST','chief_ai','Empaquetar modelos, features, evaluación y monitoring.',
    ['model pipelines','feature contracts','evaluation harness','drift checks'],['model_quality','drift','inference_reliability'],['analytics.read','platform.read','development.propose'],['model-evaluation','drift-scan','feature-contract-draft'],['model-production-enable']),
  agent_engineer:role('AI Agent Engineer','data_ai','SPECIALIST','chief_ai','Diseñar prompts, tools, handoffs y límites de agentes.',
    ['agent definitions','tool contracts','handoffs','guardrails'],['agent_success','tool_error_rate','policy_violations'],['platform.read','development.propose','audit.read'],['agent-draft','handoff-test','guardrail-review'],['automation-enable','permission-change']),
  ai_evaluator:role('AI Evaluator','data_ai','LEAD','chief_ai','Evaluar factualidad, seguridad, cumplimiento y utilidad de salidas IA.',
    ['eval suites','fact checks','policy evals','regression scoring'],['eval_pass_rate','hallucination_rate','policy_violation_rate'],['platform.read','audit.read','analytics.read','operations.propose'],['output-evaluation','fact-check','agent-regression'],['evaluation-policy-change']),
  prompt_governance:role('Prompt & Policy Governance IA','data_ai','MANAGER','chief_ai','Versionar instrucciones, políticas y contratos de comportamiento.',
    ['prompt registry','versioning','policy alignment','change impact'],['prompt_coverage','regression_rate','policy_alignment'],['platform.read','audit.read','development.propose'],['prompt-review','policy-diff','regression-plan'],['policy-change']),

  // ── Producto ──────────────────────────────────────────────────────────────
  product_management:role('Product Manager IA','product','MANAGER','chief_product','Gestionar problemas, roadmap, requisitos y resultados de producto.',
    ['customer problems','requirements','prioritization','outcome tracking'],['feature_adoption','conversion','repeat_rate'],['catalog.read','analytics.read','customer.read','catalog.propose'],['roadmap-draft','requirement-draft','opportunity-scan'],['product-publish']),
  category_manager:role('Category Manager IA','product','MANAGER','chief_product','Optimizar surtido, arquitectura de categorías y productividad del portfolio.',
    ['assortment','range review','category economics','SKU rationalization'],['category_revenue','category_margin','stock_turns'],['catalog.read','analytics.read','inventory.read','catalog.propose'],['assortment-scan','range-draft','sku-review'],['product-unpublish','price-change']),
  product_innovation:role('Product Innovation IA','product','SPECIALIST','chief_product','Crear conceptos y recetas/productos candidatos con evidencia y constraints.',
    ['trend-to-concept','ingredient reuse','margin hypothesis','prototype brief'],['concept_pipeline','validation_rate','margin_potential'],['catalog.read','analytics.read','compliance.read','catalog.propose'],['concept-draft','portfolio-gap-scan','prototype-brief'],['product-approve','claim-approve']),
  product_ops:role('Product Operations IA','product','SPECIALIST','product_management','Mantener procesos, taxonomy, templates y release readiness de producto.',
    ['taxonomy','templates','launch checklist','data completeness'],['launch_readiness','catalog_completeness','process_cycle'],['catalog.read','platform.read','catalog.propose'],['catalog-completeness-scan','launch-checklist'],['product-publish']),
  ux_research:role('UX Research IA','product','SPECIALIST','chief_product','Sintetizar comportamiento, feedback y fricciones sin inferir atributos sensibles.',
    ['journey evidence','feedback themes','usability hypotheses','research plans'],['research_coverage','friction_resolution','evidence_quality'],['customer.read','analytics.read','operations.propose'],['feedback-synthesis','research-plan','friction-hypothesis'],[]),
  ux_design:role('UX/UI Design IA','product','SPECIALIST','chief_product','Diseñar experiencias claras, accesibles y coherentes con marca.',
    ['interaction flows','wireframes','design review','accessibility'],['task_success','a11y_findings','design_consistency'],['platform.read','analytics.read','development.propose'],['ux-audit','wireframe-draft','design-spec'],['publish']),

  // ── Ventas & Revenue ─────────────────────────────────────────────────────
  sales_director:role('Sales Director IA','sales','DIRECTOR','chief_revenue','Dirigir objetivos comerciales, embudo y productividad de ventas.',
    ['sales targets','funnel review','channel priorities','sales playbooks'],['revenue','conversion','sales_margin','pipeline_velocity'],['analytics.read','catalog.read','sales.propose'],['sales-plan','funnel-scan','playbook-draft'],['discount','promotion-publish']),
  retail_sales:role('Retail Sales IA','sales','SPECIALIST','sales_director','Optimizar venta asistida y oportunidades en tienda.',
    ['basket analysis','attach rate','hourly opportunities','script drafts'],['aov','attach_rate','conversion'],['analytics.read','catalog.read','sales.propose'],['basket-opportunity','hourly-demand-scan','sales-script-draft'],['discount']),
  inside_sales:role('Inside Sales IA','sales','SPECIALIST','sales_director','Gestionar oportunidades remotas y seguimiento comercial no sensible.',
    ['lead prioritization','follow-up drafts','offer configuration','pipeline hygiene'],['response_rate','win_rate','pipeline_hygiene'],['customer.read','catalog.read','sales.propose'],['lead-priority','followup-draft','offer-draft'],['customer-message','discount']),
  b2b_sales:role('B2B Sales IA','sales','MANAGER','sales_director','Desarrollar gimnasios, clubes, empresas y cuentas profesionales.',
    ['account research','proposal drafts','pipeline','renewal opportunities'],['b2b_revenue','win_rate','account_retention'],['analytics.read','catalog.read','customer.read','sales.propose'],['account-opportunity','proposal-draft','renewal-scan'],['contract-commit','discount']),
  sales_ops:role('Sales Operations IA','sales','MANAGER','chief_revenue','Mantener forecasting comercial, territorio, CRM y productividad.',
    ['sales forecast','CRM hygiene','quota analytics','pipeline definitions'],['forecast_variance','crm_completeness','pipeline_accuracy'],['analytics.read','customer.read','sales.propose'],['sales-forecast','crm-quality-scan','pipeline-health'],['metric-definition-change']),
  revenue_ops:role('Revenue Operations IA','sales','DIRECTOR','chief_revenue','Unificar marketing, ventas, ecommerce y customer lifecycle alrededor del revenue.',
    ['funnel definitions','handoffs','lifecycle analytics','revenue attribution'],['funnel_conversion','attribution_coverage','handoff_loss'],['analytics.read','marketing.read','customer.read','sales.propose'],['funnel-scan','handoff-gap-scan','attribution-brief'],['metric-definition-change']),
  pricing_revenue:role('Revenue Pricing IA','sales','MANAGER','chief_revenue','Proponer precio y promo con límites de margen y evidencia.',
    ['elasticity hypotheses','promo economics','price ladders','competitive position'],['gross_margin','promo_roi','price_realization'],['finance.read','analytics.read','catalog.read','finance.propose'],['margin-scan','promo-economics','price-opportunity-scan'],['price-change','discount']),

  // ── Marketing & Growth ───────────────────────────────────────────────────
  brand_director:role('Brand Director IA','marketing','DIRECTOR','chief_marketing','Custodiar posicionamiento, identidad, mensajes y consistencia de marca.',
    ['brand system','message hierarchy','creative standards','brand audit'],['brand_consistency','organic_mentions','creative_quality'],['marketing.read','catalog.read','marketing.propose'],['brand-audit','message-draft','creative-brief'],['publish']),
  performance_marketing:role('Performance Marketing IA','marketing','MANAGER','chief_marketing','Optimizar campañas pagadas con presupuesto y ROAS gobernados.',
    ['campaign analysis','audience tests','budget draft','creative test plan'],['roas','cac','incremental_revenue'],['marketing.read','analytics.read','finance.read','marketing.propose'],['campaign-draft','budget-reallocation-draft','performance-scan'],['ad-spend-change','publish']),
  content_strategy:role('Content Strategy IA','marketing','MANAGER','chief_marketing','Planificar contenido por intención, canal y etapa del funnel.',
    ['editorial calendar','topic clusters','content briefs','repurposing'],['organic_growth','engagement','content_conversion'],['marketing.read','analytics.read','catalog.read','marketing.propose'],['content-plan','content-gap-scan','brief-draft'],['publish']),
  social_media:role('Social Media IA','marketing','SPECIALIST','content_strategy','Preparar publicaciones, guiones, community insights y calendario.',
    ['post drafts','video scripts','community themes','calendar'],['engagement','reach','traffic'],['marketing.read','analytics.read','marketing.propose'],['social-draft','trend-scan','calendar-draft'],['publish','customer-message']),
  seo_manager:role('SEO Manager IA','marketing','MANAGER','chief_marketing','Dirigir SEO técnico, contenido y local.',
    ['technical SEO','keyword clusters','internal links','local SEO'],['organic_sessions','nonbrand_rank','local_visibility'],['catalog.read','analytics.read','marketing.propose','platform.read'],['seo-audit','content-gap-scan','local-seo-scan'],['publish']),
  crm_marketing:role('CRM & Lifecycle IA','marketing','MANAGER','chief_marketing','Diseñar ciclos de onboarding, recuperación, recompra y win-back.',
    ['segments','lifecycle flows','cart recovery','repurchase timing'],['retention','repeat_purchase','recovery_rate'],['customer.read','analytics.read','marketing.propose'],['segment-draft','recovery-opportunity','lifecycle-draft'],['customer-message','discount']),
  growth_manager:role('Growth Manager IA','marketing','MANAGER','chief_marketing','Generar y priorizar experimentos de adquisición, conversión y retención.',
    ['growth backlog','experiment hypotheses','funnel diagnosis','learning log'],['experiment_velocity','incremental_revenue','conversion'],['analytics.read','marketing.read','catalog.read','marketing.propose'],['growth-experiment-draft','funnel-scan','opportunity-score'],['experiment-publish','discount']),
  partnerships_marketing:role('Influencers & Partnerships IA','marketing','SPECIALIST','chief_marketing','Identificar colaboraciones y preparar propuestas sin cerrar contratos.',
    ['partner research','fit scoring','activation briefs','performance tracking'],['partner_roi','qualified_partners','activation_value'],['marketing.read','analytics.read','operations.propose'],['partner-scan','fit-score','activation-draft'],['contract-commit','customer-message']),

  // ── Customer ──────────────────────────────────────────────────────────────
  customer_service_manager:role('Customer Service Manager IA','customer','MANAGER','chief_customer','Dirigir cola, SLA, escalado y calidad de soporte.',
    ['queue health','SLA','case taxonomy','escalations'],['csat','first_response_time','resolution_time'],['customer.read','orders.read','customer.propose'],['case-triage','sla-scan','escalation-draft'],['refund','customer-message','account-change']),
  support_agent:role('Customer Support IA','customer','OPERATOR','customer_service_manager','Resolver consultas repetibles basadas en datos autorizados.',
    ['FAQ','order status','product availability','policy lookup'],['first_response_time','resolution_rate','handoff_rate'],['customer.read','orders.read','catalog.read','customer.propose'],['reply-draft','case-triage','order-status-brief'],['customer-message','refund','account-change']),
  cx_manager:role('Customer Experience IA','customer','MANAGER','chief_customer','Analizar journey y priorizar fricciones.',
    ['journey maps','friction backlog','review insights','service design'],['journey_conversion','complaint_rate','repeat_purchase'],['customer.read','analytics.read','operations.propose'],['journey-friction-scan','review-insight-scan','cx-priority'],['policy-change']),
  loyalty_manager:role('Loyalty IA','customer','MANAGER','chief_customer','Diseñar fidelización y beneficios con límites económicos.',
    ['cohorts','benefit economics','retention opportunities','membership analysis'],['repeat_purchase','retention','benefit_roi'],['customer.read','analytics.read','finance.read','marketing.propose'],['loyalty-opportunity','cohort-scan','benefit-draft'],['loyalty-rule-change','discount','customer-message']),
  reputation_manager:role('Reputation IA','customer','SPECIALIST','chief_customer','Consolidar reseñas, temas y alertas reputacionales.',
    ['review monitoring','theme extraction','response drafts','root-cause routing'],['rating_trend','response_time','issue_recurrence'],['customer.read','analytics.read','marketing.propose'],['review-insight-scan','response-draft','reputation-alert'],['customer-message']),

  // ── Supply Chain ──────────────────────────────────────────────────────────
  demand_planner:role('Demand Planner IA','supply','MANAGER','chief_supply','Prever demanda, cobertura y estacionalidad con incertidumbre explícita.',
    ['demand forecast','seasonality','coverage','bias analysis'],['forecast_variance','stockout_rate','forecast_bias'],['analytics.read','inventory.read','purchasing.propose'],['demand-forecast','coverage-scan','seasonality-scan'],['forecast-policy-change']),
  inventory_manager:role('Inventory Manager IA','supply','MANAGER','chief_supply','Optimizar stock, rotación, caducidad y seguridad de inventario.',
    ['stock health','safety stock','expiry','dead stock'],['inventory_turns','stockout_rate','waste','expiry_loss'],['inventory.read','inventory.propose','analytics.read'],['low-stock-scan','rotation-scan','expiry-scan','dead-stock-scan'],['stock-adjust','lot-recall','lot-release']),
  procurement_manager:role('Procurement Manager IA','supply','MANAGER','chief_supply','Preparar planes de compra y sourcing con segregación financiera.',
    ['replenishment','RFQ drafts','vendor comparison','PO drafts'],['purchase_variance','supplier_otif','coverage'],['purchasing.read','inventory.read','analytics.read','purchasing.propose'],['replenishment-draft','purchase-plan','rfq-draft'],['purchase-order-approve','purchase-order-send','supplier-create']),
  strategic_sourcing:role('Strategic Sourcing IA','supply','SPECIALIST','procurement_manager','Buscar y comparar proveedores, TCO y riesgos.',
    ['supplier discovery','TCO comparison','MOQ/lead-time','alternate sources'],['sourcing_savings','supplier_risk','alternate_coverage'],['purchasing.read','analytics.read','compliance.read','purchasing.propose'],['sourcing-draft','tco-compare','supplier-risk-scan'],['supplier-create','contract-commit']),
  supplier_manager:role('Supplier Relationship IA','supply','MANAGER','chief_supply','Mantener scorecards, incidencias y desarrollo de proveedores.',
    ['scorecards','OTIF','quality issues','review agenda'],['supplier_otif','quality_incidents','issue_closure'],['purchasing.read','compliance.read','analytics.read','purchasing.propose'],['supplier-scorecard','supplier-risk-scan','review-draft'],['supplier-block','contract-commit']),
  logistics_manager:role('Logistics Manager IA','supply','MANAGER','chief_supply','Optimizar envíos, carriers, devoluciones y excepciones logísticas.',
    ['shipment exceptions','carrier performance','delivery SLA','return routing'],['on_time_delivery','delivery_cost','damage_rate'],['orders.read','shipping.read','shipping.propose'],['delay-scan','carrier-performance-scan','shipment-priority'],['shipment-change','carrier-change','return-approve']),
  warehouse_planner:role('Warehouse & Fulfillment IA','supply','SPECIALIST','logistics_manager','Planificar picking, packing, capacidad y exactitud de fulfillment.',
    ['pick waves','capacity','pack rules','exception queue'],['pick_accuracy','fulfillment_time','capacity_utilization'],['orders.read','inventory.read','shipping.read','operations.propose'],['fulfillment-priority','capacity-scan','exception-triage'],['shipment-change']),

  // ── Operaciones ───────────────────────────────────────────────────────────
  operations_director:role('Operations Director IA','operations','DIRECTOR','chief_operating','Dirigir ejecución diaria, productividad y estandarización.',
    ['daily operating review','capacity','SOP adherence','incident priorities'],['service_level','throughput','waste','incident_rate'],['platform.read','operations.propose','analytics.read'],['daily-ops-brief','capacity-scan','process-bottleneck-scan'],['maintenance-mode','automation-enable']),
  retail_operations:role('Retail Operations IA','operations','MANAGER','operations_director','Optimizar operación del local, horas, colas y estándares.',
    ['opening/closing checks','service flow','peak capacity','store issues'],['service_time','availability','waste','customer_wait'],['platform.read','analytics.read','operations.propose'],['store-health','peak-load-scan','checklist-draft'],['staff-change']),
  process_excellence:role('Process Excellence IA','operations','MANAGER','operations_director','Mapear y mejorar procesos con Lean/continuous improvement.',
    ['process maps','waste detection','cycle time','standard work'],['cycle_time','rework','process_variance'],['platform.read','analytics.read','operations.propose'],['process-map','bottleneck-scan','improvement-draft'],['automation-enable']),
  sop_manager:role('SOP & Knowledge IA','operations','SPECIALIST','operations_director','Mantener manuales, SOPs, versiones y ayudas operativas.',
    ['SOP inventory','versioning','role instructions','knowledge gaps'],['sop_coverage','update_age','training_alignment'],['platform.read','compliance.read','operations.propose'],['sop-gap-scan','sop-draft','knowledge-gap-scan'],['sop-publish']),
  maintenance_planner:role('Maintenance Planner IA','operations','SPECIALIST','operations_director','Planificar mantenimiento preventivo y registrar incidencias de equipos.',
    ['maintenance calendar','failure patterns','spare needs','service records'],['downtime','preventive_completion','repeat_failure'],['platform.read','operations.propose','audit.read'],['maintenance-schedule','failure-pattern-scan','service-draft'],['maintenance-mode']),

  // ── Digital / Ecommerce ───────────────────────────────────────────────────
  ecommerce_director:role('Ecommerce Director IA','digital','DIRECTOR','chief_revenue','Dirigir experiencia comercial digital, catálogo y conversión.',
    ['digital P&L inputs','conversion priorities','merchandising','channel roadmap'],['digital_revenue','conversion','aov','cart_abandonment'],['catalog.read','analytics.read','customer.read','catalog.propose'],['ecommerce-brief','conversion-scan','merchandising-draft'],['product-publish','price-change']),
  catalog_manager:role('Catalog Manager IA','digital','MANAGER','ecommerce_director','Mantener estructura, atributos, URLs y completitud de catálogo.',
    ['taxonomy','attributes','SKU completeness','URL hygiene'],['catalog_completeness','attribute_accuracy','seo_coverage'],['catalog.read','inventory.read','catalog.propose'],['catalog-audit','taxonomy-gap-scan','attribute-draft'],['product-publish','product-unpublish']),
  merchandising:role('Digital Merchandising IA','digital','SPECIALIST','ecommerce_director','Ordenar categorías y superficies por relevancia, stock y objetivos gobernados.',
    ['sort rules','collections','campaign placements','stock-aware merchandising'],['category_conversion','clickthrough','stock_exposure'],['catalog.read','analytics.read','inventory.read','catalog.propose'],['merchandising-draft','placement-opportunity','stock-aware-sort'],['publish']),
  search_manager:role('Site Search IA','digital','SPECIALIST','ecommerce_director','Optimizar búsqueda, sinónimos, zero-results e intención.',
    ['query analysis','synonyms','zero-result recovery','search ranking hypotheses'],['search_success','zero_results','search_conversion'],['catalog.read','analytics.read','catalog.propose'],['search-gap-scan','synonym-draft','ranking-hypothesis'],['search-config-change']),
  checkout_manager:role('Checkout & Payments UX IA','digital','MANAGER','ecommerce_director','Reducir fricción de checkout sin alterar configuración financiera crítica.',
    ['checkout funnel','payment errors','form friction','recovery hypotheses'],['checkout_conversion','payment_failure_rate','dropoff'],['analytics.read','orders.read','platform.read','development.propose'],['checkout-scan','payment-error-scan','ux-fix-draft'],['payment-config-change','production-deploy']),
  marketplace_manager:role('Marketplace Manager IA','digital','MANAGER','ecommerce_director','Preparar listings y economics de canales externos.',
    ['listing completeness','channel margin','sync gaps','marketplace opportunities'],['marketplace_revenue','channel_margin','listing_quality'],['catalog.read','analytics.read','operations.propose'],['marketplace-gap-scan','listing-draft','channel-margin-scan'],['marketplace-publish','integration-enable']),
  conversion_optimization:role('CRO IA','digital','MANAGER','ecommerce_director','Diagnosticar funnel y proponer experimentos medibles.',
    ['funnel analysis','hypotheses','test plans','result interpretation'],['conversion','experiment_win_rate','incremental_revenue'],['analytics.read','catalog.read','marketing.read','marketing.propose'],['conversion-scan','experiment-draft','result-analysis'],['experiment-publish']),

  // ── Security ──────────────────────────────────────────────────────────────
  security_operations:role('Security Operations IA','security','MANAGER','chief_security','Monitorizar señales, triage y respuesta inicial a incidentes.',
    ['alert triage','incident timeline','containment drafts','evidence preservation'],['mttd','mttr_security','false_positive_rate'],['security.read','audit.read','security.propose'],['security-scan','incident-triage','containment-draft'],['session-revoke','integration-disable']),
  iam_security:role('Identity & Access IA','security','SPECIALIST','chief_security','Auditar roles, privilegios y accesos bajo mínimo privilegio.',
    ['RBAC review','orphan access','privilege drift','MFA coverage'],['privilege_violations','mfa_coverage','orphan_accounts'],['security.read','audit.read','security.propose'],['access-risk-scan','privilege-drift-scan','rbac-review'],['permission-change','session-revoke']),
  appsec:role('Application Security IA','security','SPECIALIST','chief_security','Revisar código, dependencias, secretos y patrones inseguros.',
    ['SAST review','dependency risk','secret scan','security test plan'],['critical_findings','dependency_risk','secret_exposure'],['security.read','platform.read','development.propose'],['dependency-risk-scan','security-code-review','secret-scan'],['code-merge','production-deploy']),
  cloud_security:role('Cloud & Platform Security IA','security','SPECIALIST','chief_security','Revisar configuración, CI/CD, secrets y exposición de plataforma.',
    ['config review','workflow permissions','secret handling','runtime hardening'],['misconfigurations','workflow_risk','secret_hygiene'],['security.read','platform.read','audit.read','security.propose'],['config-scan','workflow-permission-scan','hardening-draft'],['workflow-change','secret-rotate']),
  incident_response:role('Incident Response IA','security','LEAD','chief_security','Coordinar playbooks y evidencias durante incidentes.',
    ['incident classification','timeline','containment options','recovery checklist'],['containment_time','evidence_completeness','recovery_time'],['security.read','audit.read','platform.read','security.propose'],['incident-command-draft','evidence-pack','recovery-checklist'],['integration-disable','session-revoke','secret-rotate']),
  business_continuity:role('Business Continuity IA','security','MANAGER','chief_security','Mantener BCP, backups, restore tests y dependencias críticas.',
    ['BCP','backup verification','restore drills','dependency map'],['backup_success','restore_success','rto_readiness'],['platform.read','audit.read','operations.propose'],['backup-status','restore-readiness','continuity-scan'],['maintenance-mode']),

  // ── Quality / Food Safety / Regulatory ───────────────────────────────────
  food_safety_director:role('Food Safety Director IA','quality','DIRECTOR','chief_compliance','Ejercer control independiente sobre seguridad alimentaria y APPCC.',
    ['hazard review','supplier evidence','traceability','incident escalation'],['traceability_coverage','food_safety_findings','closure_time'],['compliance.read','catalog.read','purchasing.read','compliance.propose'],['hazard-scan','traceability-scan','supplier-evidence-gap'],['product-block','lot-release','lot-recall']),
  regulatory_affairs:role('Regulatory Affairs IA','quality','MANAGER','chief_compliance','Verificar requisitos España/UE de etiquetado, claims y market access.',
    ['label review','claim basis','market access checklist','regulatory watch'],['label_accuracy','claim_findings','market_access_readiness'],['compliance.read','catalog.read','compliance.propose'],['label-risk-scan','claim-scan','market-access-check'],['claim-approve','product-approve']),
  supplier_quality:role('Supplier Quality IA','quality','MANAGER','food_safety_director','Evaluar documentación, calidad e incidencias de proveedores.',
    ['supplier qualification','COA/documents','nonconformance','CAPA follow-up'],['supplier_compliance','nonconformance_rate','capa_closure'],['compliance.read','purchasing.read','catalog.read','compliance.propose'],['supplier-doc-gap','quality-scorecard','capa-followup'],['supplier-block']),
  labeling_specialist:role('Labeling & Claims IA','quality','SPECIALIST','regulatory_affairs','Revisar ingredientes, alérgenos, nutrición y wording regulatorio.',
    ['ingredient list','allergen check','nutrition table','claim wording'],['label_accuracy','allergen_findings','claim_findings'],['compliance.read','catalog.read','compliance.propose'],['label-check','allergen-scan','claim-risk-scan'],['claim-approve']),
  traceability_manager:role('Traceability IA','quality','MANAGER','food_safety_director','Mantener vínculo lote-proveedor-recepción-venta e incidentes.',
    ['lot lineage','receipt evidence','recall readiness','trace gaps'],['traceability_coverage','recall_readiness','missing_lots'],['compliance.read','inventory.read','orders.read','compliance.propose'],['traceability-scan','recall-simulation','lot-gap-scan'],['lot-recall','lot-release']),
  quality_assurance:role('Quality Assurance IA','quality','MANAGER','chief_compliance','Mantener controles de calidad, CAPA y evidencia de proceso.',
    ['quality checks','CAPA','deviation register','release evidence'],['quality_incidents','capa_closure','deviation_repeat'],['compliance.read','platform.read','audit.read','compliance.propose'],['quality-scan','capa-draft','deviation-trend'],['product-block']),

  // ── Expansion / Franchise ────────────────────────────────────────────────
  expansion_director:role('Expansion Director IA','expansion','DIRECTOR','chief_executive','Dirigir pipeline de nuevos mercados, ubicaciones y modelos de expansión.',
    ['market screening','site pipeline','business case','readiness gates'],['site_pipeline','payback','market_readiness'],['analytics.read','finance.read','platform.read','operations.propose'],['market-screen','site-score-draft','expansion-business-case'],['market-entry-approve','capital-allocation']),
  franchise_director:role('Franchise Director IA','expansion','DIRECTOR','chief_executive','Construir estándares, economics y readiness de franquicia.',
    ['franchise manual','unit economics','readiness assessment','standards'],['franchise_readiness','standard_compliance','unit_economics'],['platform.read','analytics.read','finance.read','operations.propose'],['franchise-readiness-scan','standardization-scan','unit-economics-draft'],['franchise-approve','contract-commit']),
  site_selection:role('Site Selection IA','expansion','SPECIALIST','expansion_director','Puntuar ubicaciones con criterios documentados y escenarios.',
    ['catchment analysis','competition','rent economics','traffic proxies'],['site_score_quality','data_coverage','payback_scenario'],['analytics.read','finance.read','operations.propose'],['site-score-draft','location-risk-scan','scenario-draft'],['market-entry-approve']),
  partnerships:role('Strategic Partnerships IA','expansion','MANAGER','expansion_director','Desarrollar alianzas comerciales, distribución y ecosistema.',
    ['partner pipeline','strategic fit','value model','activation plan'],['partner_value','pipeline_quality','activation_rate'],['analytics.read','platform.read','operations.propose'],['partner-fit-score','partnership-draft','activation-plan'],['contract-commit']),

  // ── ESG ──────────────────────────────────────────────────────────────────
  sustainability_director:role('Sustainability Director IA','esg','DIRECTOR','chief_executive','Dirigir reducción de residuos, eficiencia y reporting ESG verificable.',
    ['waste baseline','resource efficiency','supplier ESG','claim evidence'],['waste_reduction','resource_efficiency','supplier_esg_coverage'],['analytics.read','purchasing.read','operations.propose'],['waste-scan','resource-efficiency-scan','supplier-esg-draft'],['esg-claim-publish']),
  waste_manager:role('Waste & Circularity IA','esg','SPECIALIST','sustainability_director','Detectar desperdicio, mermas y oportunidades de circularidad.',
    ['waste categories','root causes','prevention opportunities','tracking'],['waste','prevented_waste','measurement_coverage'],['analytics.read','inventory.read','operations.propose'],['waste-scan','waste-root-cause','prevention-draft'],[]),
});

const FORBIDDEN_AUTONOMY = Object.freeze(new Set([
  'capital-allocation','policy-change','employment-decision','staff-change','permission-change','market-entry-approve',
  'code-merge','production-deploy','workflow-change','database-migration','integration-enable','integration-disable','automation-enable',
  'secret-rotate','session-revoke','payment-config-change','payment-release','refund','invoice-void','writeoff',
  'purchase-order-approve','purchase-order-send','supplier-create','supplier-block','contract-commit','legal-approval','risk-acceptance',
  'product-approve','product-block','product-publish','product-unpublish','claim-approve','lot-release','lot-recall',
  'price-change','discount','promotion-publish','publish','customer-message','account-change','marketplace-publish','franchise-approve',
  'data-delete','tax-filing','model-production-enable','evaluation-policy-change','search-config-change','monitoring-policy-change','esg-claim-publish'
]));

const VETO_ROLES = Object.freeze(new Set(['chief_audit','chief_compliance','chief_security','chief_financial','general_counsel','food_safety_director','enterprise_risk','procurement_finance']));

function getRole(id){return ROLES[String(id||'').trim().toLowerCase()]||null;}
function families(){
  const out={};
  for(const [id,r] of Object.entries(ROLES)) (out[r.family]??=[]).push(id);
  return out;
}
function directReports(managerId){return Object.entries(ROLES).filter(([,r])=>r.reportsTo===managerId).map(([id])=>id);}
function hierarchy(root='chief_executive',seen=new Set()){
  if(seen.has(root))return {id:root,cycle:true};
  const r=getRole(root); if(!r)return null;
  const next=new Set(seen);next.add(root);
  return {id:root,title:r.title,family:r.family,level:r.level,reports:directReports(root).map(id=>hierarchy(id,next))};
}
function rolePolicy(id,action){
  const r=getRole(id),a=String(action||'').trim().toLowerCase();
  if(!r)return{allowed:false,error:'Puesto IA no reconocido.'};
  if(!a)return{allowed:false,error:'Acción no indicada.'};
  const forbidden=FORBIDDEN_AUTONOMY.has(a);
  const sensitive=forbidden||r.sensitive.includes(a);
  const autonomous=r.autonomous.includes(a)&&!sensitive;
  return {allowed:true,role:id,action:a,title:r.title,family:r.family,scopes:[...r.scopes],risk:forbidden?RISK.OWNER:(sensitive?RISK.APPROVAL:(autonomous?RISK.LOW:RISK.REVERSIBLE)),autonomous,requiresApproval:!autonomous,vetoRole:VETO_ROLES.has(id)};
}
function publicRegistry(){
  return Object.fromEntries(Object.entries(ROLES).map(([id,r])=>[id,{title:r.title,family:r.family,department:r.department,level:r.level,reportsTo:r.reportsTo,mission:r.mission,responsibilities:[...r.responsibilities],kpis:[...r.kpis],autonomous:[...r.autonomous],sensitive:[...r.sensitive],vetoRole:VETO_ROLES.has(id)}]));
}
function validate(){
  const errors=[]; const ids=new Set(Object.keys(ROLES));
  for(const [id,r] of Object.entries(ROLES)){
    if(!FAMILIES[r.family])errors.push(`${id}: familia inexistente ${r.family}`);
    if(!LEVELS.includes(r.level))errors.push(`${id}: nivel inválido ${r.level}`);
    if(r.reportsTo&&!ids.has(r.reportsTo))errors.push(`${id}: manager inexistente ${r.reportsTo}`);
    if(!r.responsibilities.length)errors.push(`${id}: sin responsabilidades`);
    if(!r.kpis.length)errors.push(`${id}: sin KPIs`);
    for(const a of r.autonomous)if(FORBIDDEN_AUTONOMY.has(a))errors.push(`${id}: acción prohibida marcada autónoma ${a}`);
  }
  const visit=(id,path=[])=>{if(path.includes(id)){errors.push(`ciclo jerárquico: ${[...path,id].join(' -> ')}`);return;}for(const child of directReports(id))visit(child,[...path,id]);};
  visit('chief_executive');
  return {ok:errors.length===0,roles:Object.keys(ROLES).length,families:Object.keys(FAMILIES).length,vetoRoles:VETO_ROLES.size,errors};
}

module.exports={LEVELS,RISK,FAMILIES,ROLES,FORBIDDEN_AUTONOMY,VETO_ROLES,getRole,families,directReports,hierarchy,rolePolicy,publicRegistry,validate};
