# Knowledge Base

El módulo Knowledge Base vive en `apps/api/src/knowledge-base` y usa PostgreSQL mediante Prisma. No depende de OpenAI, Meta, Instagram, Messenger, WhatsApp ni webhooks.

## Recursos REST

Todos los recursos se publican bajo `/api/v1/knowledge-base`:

- `/faqs`
- `/products`
- `/services`
- `/promotions`
- `/schedules`
- `/policies`

Cada recurso admite `GET` para listado, `GET /:id`, `POST`, `PATCH /:id` y `DELETE /:id`. Los listados reciben `page`, `pageSize`, `search`, `sort` y `active`.

Las respuestas paginadas incluyen `items`, `total`, `page`, `pageSize` y `pages`.

## Reglas operativas

- El `organizationId` siempre se obtiene de la sesión; nunca se acepta desde el cuerpo de una solicitud.
- Agentes pueden consultar, supervisores pueden crear y editar, y administradores pueden eliminar.
- `DELETE` realiza eliminación lógica con `deletedAt` y desactiva el registro.
- Cada alta, cambio y eliminación genera un registro en `AuditLog`.
- Las categorías están normalizadas por organización y tipo de conocimiento.
- Los horarios separan la cabecera de sus días y validan zona horaria, días duplicados e intervalos.
- Las promociones validan fechas, importes y porcentajes máximos de 100.
- SKU, códigos y monedas se normalizan antes de persistirse.

## Base de datos

La migración se encuentra en `prisma/migrations/20260722000100_knowledge_base/migration.sql`. Para una base nueva, ejecuta `npm run db:migrate`. Knowledge Base no carga contenido predefinido.

## Validación

Ejecuta `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Las pruebas comprueban aislamiento entre organizaciones, búsqueda, paginación, eliminación lógica, auditoría y reglas de promociones y horarios.
