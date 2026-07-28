# Autenticación y roles

`POST /api/v1/auth/login` verifica una contraseña bcrypt, usuario activo, membresía y organización activa. La API crea una sesión persistida y entrega un JWT de ocho horas en `nexoia_session`, cookie `httpOnly`, `SameSite=Strict` y `Secure` en producción. Las mutaciones autenticadas exigen además el token CSRF de doble envío.

El cierre de sesión revoca la sesión en PostgreSQL y elimina cookies. La recuperación está preparada con respuesta no enumerativa y tabla de tokens de un solo uso; el envío de correo queda para una fase posterior.

Roles: `SUPER_ADMIN` administra plataforma y debe seleccionar organización explícitamente; `ORGANIZATION_ADMIN` administra su tenant; `SUPERVISOR` atiende/asigna y consulta analítica; `AGENT` solo atiende conversaciones asignadas, consulta contactos permitidos y crea notas. Los permisos se comprueban con guards del backend.
