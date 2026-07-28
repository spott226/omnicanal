# Arquitectura de NexoIA — Fases 1 y 2

NexoIA conserva la interfaz Next.js/Vinext existente en la raíz y agrega una API NestJS en `apps/api`. El contrato compartido vive en `packages/shared`, Prisma y las migraciones en `prisma`, PostgreSQL es la fuente de verdad y Redis queda preparado para rate limiting distribuido, colas y recordatorios posteriores.

```text
Web Next.js (Vercel) ── HTTPS + cookies ── API NestJS (Railway)
                                               ├─ PostgreSQL + Prisma
                                               └─ Redis (preparado)
```

La API se divide en identidad/sesión, contexto multiempresa, contactos, conversaciones, mensajes, notas, etiquetas, prompts, automatizaciones, citas, recordatorios, analítica, auditoría y un módulo independiente de Knowledge Base. No existen adaptadores reales de Meta ni de IA en estas fases.

Las variables se validan al arrancar. La API aplica Helmet, CORS restringido, rate limiting, DTO con lista blanca, cookies `httpOnly`, CSRF, identificadores de correlación y errores sanitizados. El despliegue ejecuta migraciones una vez antes de iniciar la API.
