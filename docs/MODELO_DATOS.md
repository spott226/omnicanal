# Modelo de datos

Todas las entidades de negocio incluyen `organizationId`, salvo `Organization`, `AIProvider` y datos exclusivos de plataforma. Los identificadores son UUID; las fechas se guardan en UTC.

| Entidad | Propósito y relaciones clave |
|---|---|
| Organization | Cliente aislado; posee membresías, canales y configuración. |
| User | Identidad global; participa mediante Membership. |
| Membership | Une usuario y organización con rol. |
| ChannelConnection | Configuración cifrada, estado y cuenta externa de un canal. |
| Contact | Persona unificada dentro de una organización. |
| Conversation | Hilo por contacto y canal; asignación, estado y control de IA. |
| Message | Mensaje normalizado, dirección, autor, payload y clave externa idempotente. |
| Tag / ContactTag | Taxonomía y relación N:M con contactos. |
| LeadScore | Puntuación, temperatura, razones y versión del algoritmo. |
| Prompt / PromptVersion | Configuración del agente y versiones inmutables. |
| Automation / AutomationExecution | Regla y cada ejecución trazable. |
| Appointment | Horario, enlace, proveedor de calendario y estado. |
| Reminder | Trabajo programado basado en plantilla. |
| AIProvider | Catálogo privado de proveedores y capacidades. |
| OrganizationAIConfig | Proveedor principal/respaldo, modelo, presupuesto y límites. |
| AIUsageRecord | Tokens, latencia, costo, modelo y conversación. |
| AuditLog | Actor, acción, entidad, cambios y contexto de seguridad. |

## Reglas importantes

- Un contacto no puede compartir datos con otra organización.
- `Message(organizationId, channelConnectionId, externalMessageId)` es único.
- Una sola versión de prompt puede estar publicada por prompt.
- El historial de puntuación no se sobreescribe; la vista actual toma el registro más reciente.
- Las API keys no se almacenan en texto plano: se guardan `ciphertext`, `iv`, `authTag` y versión de clave.
- Los borrados de negocio son lógicos; auditoría y uso de IA tienen retención controlada.

El esquema de referencia está en `prisma/schema.prisma` y sirve como base de las primeras migraciones PostgreSQL.
