# Aislamiento multiempresa

El `organizationId` se obtiene de la sesión validada. Los DTO no exponen ese campo y los servicios lo agregan a cada `where`, `create`, agregado y auditoría. Buscar por UUID nunca basta: contacto, conversación, nota, etiqueta, prompt, cita y recordatorio deben pertenecer al tenant de la sesión.

Un agente agrega además `assignedUserId` al filtro de conversaciones. El superadministrador inicia sin tenant y recibe `403` en rutas empresariales hasta ejecutar `auth/select-organization`; la selección se persiste y audita.

Las pruebas cubren lectura y actualización cruzada A/B, conversaciones por URL manipulada, notas, citas, filtros de estadísticas, roles y selección explícita. Para producción se recomienda complementar con pruebas contra PostgreSQL efímero en CI y políticas RLS como segunda barrera.
