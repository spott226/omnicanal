# Integración futura con Meta

## Adaptadores

Cada producto implementa `ChannelAdapter`: `verifyWebhook`, `validateSignature`, `normalize`, `sendMessage` y `healthcheck`. Los adaptadores son independientes para Instagram Messaging, Instagram Comments, WhatsApp Cloud API, Messenger y Facebook Comments.

## Endpoints

- `GET /webhooks/meta`: responde al reto de verificación usando un token almacenado de forma segura.
- `POST /webhooks/meta`: conserva el cuerpo crudo, valida `X-Hub-Signature-256`, identifica conexión y encola el evento.

El endpoint acusa recibo rápidamente. Ninguna respuesta de IA se genera dentro de la solicitud de Meta.

## Flujo

1. Validar firma antes de procesar contenido.
2. Crear una clave idempotente con producto, cuenta y evento externo.
3. Guardar el evento recibido y enviarlo a `meta.inbound`.
4. Normalizar a un evento interno común.
5. Resolver organización y canal en servidor.
6. Crear/actualizar contacto, conversación y mensaje en transacción.
7. Evaluar automatizaciones y política de IA.
8. Encolar la respuesta saliente; registrar respuesta externa y uso.

## Fiabilidad y seguridad

- Reintentos exponenciales con jitter; dead-letter queue tras el máximo.
- Índice único para eventos y mensajes externos.
- Secretos cifrados, rotables y jamás enviados al navegador.
- Logs sin contenido sensible ni tokens.
- Rate limit por organización/canal y circuit breaker por proveedor.
- Estados `DEMO`, `PENDING`, `CONNECTED`, `DEGRADED` y `DISCONNECTED`.

## Requisitos antes de conectar

Crear la app en Meta, completar revisión de permisos, configurar políticas y eliminación de datos, registrar URLs HTTPS, aportar credenciales oficiales y verificar cada cuenta. Hasta entonces, la interfaz conserva la etiqueta **Modo demostración** y usa eventos simulados.
