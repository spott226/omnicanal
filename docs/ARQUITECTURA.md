# Arquitectura de NexoIA

## Propósito

NexoIA es un SaaS multiempresa para atención omnicanal y automatización comercial asistida por IA. Esta primera versión es una preview funcional sin credenciales externas. La interfaz usa datos simulados y marca explícitamente el modo demostración.

## Arquitectura objetivo

```text
apps/web (Next.js) ──HTTPS/SSE── apps/api (NestJS)
                                      │
                   ┌──────────────────┼──────────────────┐
                   │                  │                  │
             PostgreSQL         Redis/BullMQ       Object storage
                                      │
                         apps/worker + adaptadores
                           ├── Meta Channels
                           └── LLM Providers
```

- **Web:** Next.js y TypeScript. Vistas, estado de interfaz y consumo de API; nunca recibe secretos.
- **API:** NestJS. Autenticación, RBAC, aislamiento por organización, casos de uso y endpoints.
- **Worker:** procesa webhooks, normalización, IA, automatizaciones, reintentos y recordatorios.
- **PostgreSQL + Prisma:** fuente de verdad transaccional.
- **Redis + BullMQ:** colas, trabajos programados, idempotencia temporal y rate limiting.
- **SSE:** actualizaciones de conversaciones; WebSockets puede incorporarse cuando haya presencia bidireccional.

## Límites de módulos

1. `identity`: sesión, usuarios, membresías y roles.
2. `organizations`: configuración y límites por cliente.
3. `inbox`: contactos, conversaciones, mensajes, etiquetas y asignación.
4. `lead-scoring`: puntuación y temperatura con trazabilidad.
5. `ai`: prompts, versiones, proveedores, uso y políticas de seguridad.
6. `automations`: disparadores, condiciones, acciones y ejecuciones.
7. `appointments`: disponibilidad, citas y recordatorios con plantillas.
8. `channels`: contrato común y adaptadores de Meta independientes.
9. `analytics`: agregados por organización.
10. `audit`: registro inmutable de acciones administrativas.

## Multiempresa y seguridad

El `organizationId` proviene de la membresía autenticada, nunca del cuerpo enviado por el cliente. Los repositorios requieren el contexto de organización y agregan el filtro en todas las operaciones. El superadministrador usa un contexto explícito, auditado y separado. Las credenciales se cifran con una clave de envoltura administrada fuera de la base de datos.

Roles: `SUPERADMIN`, `ORG_ADMIN`, `SUPERVISOR` y `AGENT`. NestJS aplica guards de autenticación, rol y organización. Se añaden validación de DTO, sanitización, CSP, CORS restringido, rate limiting, rotación de secretos y auditoría.

## Proveedores de IA

```ts
export interface LLMProvider {
  id: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
  healthcheck(): Promise<ProviderHealth>;
  estimateCost(usage: TokenUsage): Money;
}
```

Adaptadores previstos: OpenAI, DeepSeek, Qwen compatible, OpenRouter, Ollama/vLLM y `MockLLMProvider`. La resolución usa configuración por organización, proveedor principal y respaldo. Presupuestos, modelos permitidos, tokens y costo se validan en servidor.

## Despliegue

- Frontend Next.js: Vercel o Sites para la preview.
- API, worker, PostgreSQL y Redis: Railway mediante servicios separados.
- Migraciones: una tarea previa al despliegue; nunca desde todas las réplicas.
- Observabilidad: logs estructurados con `organizationId`, `correlationId` y `eventId`, métricas de cola, latencia y costo de IA.
