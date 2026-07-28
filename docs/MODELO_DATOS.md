# Modelo de datos

El esquema canónico está en `prisma/schema.prisma` y la migración inicial en `prisma/migrations`. Todas las entidades empresariales incluyen `organizationId`; ninguna consulta autoriza usando un identificador enviado por la interfaz.

Entidades principales de operación: `Organization`, `User`, `Membership`, `Session`, `PasswordResetToken`, `Contact`, `Conversation`, `Message`, `Tag`, `ContactTag`, `Note`, `Prompt`, `PromptVersion`, `Appointment`, `Reminder`, `Automation`, `AIUsageRecord` y `AuditLog`.

Knowledge Base agrega `KnowledgeCategory`, `Faq`, `Product`, `Service`, `Promotion`, `BusinessSchedule`, `ScheduleEntry` y `Policy`. Los recursos admiten eliminación lógica mediante `deletedAt`; los horarios normalizan cada día en `ScheduleEntry` y las categorías se separan por organización y tipo.

Reglas: UUID para identificadores; fechas UTC; email de usuario único; membresía única por usuario/organización; mensajes externos idempotentes por organización; etiquetas únicas por organización; versiones de prompt inmutables; consultas e índices comienzan por `organizationId`; borrado en cascada solo dentro del tenant; auditoría con borrado restringido.

Los enums normalizan estado de organización/usuario, modo `DEMO|LIVE`, plan, rol, canal, temperatura, consentimiento, estado de conversación/IA/mensaje, cita, recordatorio y uso de IA.
