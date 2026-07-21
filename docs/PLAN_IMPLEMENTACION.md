# Plan de implementación

## Fase 1 — Preview demostrable (actual)

- Acceso demo y navegación completa.
- Dashboard, bandeja con 25 conversaciones, contactos y estadísticas.
- Cambio de temperatura, pausa/activación de IA y envío simulado.
- Configuración del agente, laboratorio multicanal y automatización por palabra clave.
- Agenda ficticia, canales en modo demo y panel privado de proveedores.
- Documentación de arquitectura, datos, Meta y despliegue.

## Fase 2 — Núcleo SaaS

- Monorepo con `apps/web`, `apps/api`, `apps/worker` y paquetes compartidos.
- PostgreSQL/Prisma, Redis/BullMQ, sesiones, RBAC y aislamiento por organización.
- CRUD real para bandeja, contactos, prompts, automatizaciones y agenda.
- SSE, auditoría, pruebas de autorización y observabilidad.

## Fase 3 — IA y automatización reales

- Contrato `LLMProvider`, vault de credenciales, fallback y presupuestos.
- Calificación estructurada, políticas de seguridad y evaluación de prompts.
- Motor de reglas, plantillas de recordatorio y ejecución idempotente.

## Fase 4 — Canales Meta

- App Meta revisada, OAuth y adaptadores por producto.
- Webhooks firmados, colas, reintentos, conciliación y dead-letter queue.
- Piloto con una organización y despliegue progresivo por canal.

## Calidad y salida

Cada fase exige lint, tipos, pruebas unitarias e integración, build de producción, migración ensayada, prueba de aislamiento multiempresa y checklist de seguridad. La conexión real con Meta comienza únicamente con credenciales proporcionadas y una preview estable.
