# Integraciones reales — next.io by Mercadia

Documento operativo para pasar de proveedores mock a proveedores reales sin romper el MVP.

Regla principal: no activar proveedores reales sin autorización explícita y sin credenciales completas del usuario.

## Estado actual

El producto usa proveedores centralizados:

- `AIProviderService`
- `ChannelProviderService`
- `BillingProviderService`

Modos actuales:

```env
AI_PROVIDER_MODE=mock
CHANNEL_PROVIDER_MODE=mock
BILLING_PROVIDER_MODE=mock
```

Modos reales futuros:

```env
AI_PROVIDER_MODE=openai
CHANNEL_PROVIDER_MODE=meta
BILLING_PROVIDER_MODE=stripe
```

## Orden obligatorio

1. Stripe real.
2. IA real.
3. Meta real.

Meta se conecta al final porque depende de:

- suscripción y trial ya controlados;
- límites por plan ya aplicados;
- agente IA ya probado;
- canales modelados;
- webhooks y reintentos preparados;
- operación humana estable.

## Paso 1 — Stripe real

Objetivo: cobrar y mantener estado de suscripción real.

Variables requeridas:

```env
BILLING_PROVIDER_MODE=stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SUCCESS_URL=
STRIPE_CANCEL_URL=
```

Datos requeridos en base:

- `PlanPrice.stripePriceId` por cada plan e intervalo.
- Webhook idempotente hacia `BillingEvent`.
- Mapeo de eventos Stripe a `Subscription.status`.

Eventos mínimos a soportar antes de producción:

- checkout completado;
- invoice paid;
- invoice payment failed;
- subscription updated;
- subscription deleted/cancelled.

Validación mínima:

- crear checkout real;
- activar suscripción;
- fallar pago y bloquear operación;
- renovar periodo;
- cancelar renovación;
- evitar eventos duplicados por `providerEventId`.

## Paso 2 — IA real

Objetivo: reemplazar respuesta mock por proveedor real manteniendo el mismo contrato.

Variables requeridas:

```env
AI_PROVIDER_MODE=openai
OPENAI_API_KEY=
OPENAI_MODEL=
```

Requisitos antes de activar:

- no enviar secretos al frontend;
- registrar uso por organización;
- respetar límites `aiResponsesLimit`;
- conservar fallback si el proveedor falla;
- mantener tono, instrucciones y base de conocimiento por organización;
- registrar errores sin exponer prompts sensibles.

Validación mínima:

- simulador responde con OpenAI;
- conversación usa configuración del negocio;
- límite de respuestas IA bloquea cuando se agota;
- fallo del proveedor no tumba la API.

## Paso 3 — Meta real

Objetivo: conectar WhatsApp, Instagram y Facebook vía APIs oficiales de Meta.

Variables requeridas:

```env
CHANNEL_PROVIDER_MODE=meta
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_WEBHOOK_CALLBACK_URL=
```

Requisitos antes de activar:

- verificación de firma de webhooks;
- validación de `verify_token`;
- idempotencia de eventos entrantes;
- almacenamiento seguro de tokens;
- reconexión por token vencido;
- estados claros: no conectado, conectado, error, token vencido;
- límites por plan antes de aceptar canales adicionales.

Validación mínima:

- verificación webhook;
- evento entrante crea o actualiza contacto/conversación;
- mensaje saliente queda auditado;
- duplicado de webhook no duplica mensajes;
- token vencido cambia estado del canal.

## No hacer todavía

- No activar cobro real sin `stripePriceId`.
- No activar IA real sin límites y logging de uso.
- No activar Meta antes de Stripe e IA.
- No mezclar respuestas mock con llamadas reales silenciosas.
- No guardar secretos en frontend.
- No registrar claves en logs.

## Comandos de validación antes de conectar algo real

```powershell
npm.cmd run typecheck
npm.cmd run test:api
npm.cmd run test:web
```

