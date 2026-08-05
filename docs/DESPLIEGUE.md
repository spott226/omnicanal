# Despliegue preparado

## Recomendación para producción inicial

Para evitar problemas con webhooks de Meta, el backend debe vivir en una URL estable. La ruta recomendada es:

- Railway: API + PostgreSQL.
- Vercel: frontend.
- Meta: webhook apuntando al dominio HTTPS de Railway.

No uses ngrok para producción. Ngrok sirve para pruebas locales, pero cambia de URL y puede cortar eventos.

## Railway: API y PostgreSQL

1. Crea un proyecto en Railway.
2. Agrega un servicio PostgreSQL.
3. Agrega un servicio desde este repositorio para la API.
4. Railway usará `railway.toml`:
   - build: `npm ci && npm run db:generate && npm run build:api`
   - predeploy: `npm run db:migrate`
   - start: `npm run start:api`
   - healthcheck: `/api/v1/health`

Variables obligatorias en el servicio API:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=<Railway Postgres URL>
JWT_SECRET=<secreto largo>
SESSION_SECRET=<secreto largo distinto>
APP_ENCRYPTION_KEY=<secreto largo distinto>
FRONTEND_URL=<URL final del frontend>
BACKEND_URL=<URL final de Railway>
CORS_ORIGIN=<URL final del frontend>
NEXT_PUBLIC_API_URL=<URL final de Railway>/api/v1
AI_PROVIDER_MODE=local
CHANNEL_PROVIDER_MODE=meta
BILLING_PROVIDER_MODE=stripe
WHATSAPP_STATUS=pending
META_GRAPH_VERSION=v23.0
```

También configura las claves reales de Stripe y Meta en Railway como variables privadas. No las pegues en commits.

## Vercel: frontend

Importa el repositorio como Next.js usando `vercel.json`.

Variable obligatoria:

```env
NEXT_PUBLIC_API_URL=<URL final de Railway>/api/v1
```

Después de desplegar Vercel, actualiza en Railway:

```env
FRONTEND_URL=<URL final de Vercel>
CORS_ORIGIN=<URL final de Vercel>
```

## Meta después de desplegar Railway

En Meta pega:

```text
URL de webhook:
<URL final de Railway>/api/v1/meta/webhook

Token de verificación:
el mismo valor de META_VERIFY_TOKEN configurado en Railway
```

Para OAuth de Instagram:

```text
URL de redireccionamiento:
<URL final de Railway>/api/v1/meta/instagram/callback
```

## Verificación rápida

Backend:

```text
<URL final de Railway>/api/v1/health
```

Webhook Meta manual:

```text
<URL final de Railway>/api/v1/meta/webhook?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123456
```

Si responde `123456`, Meta puede verificar el webhook.

## Reglas

- No subir `.env`.
- No guardar tokens de Meta o Stripe en git.
- No ejecutar seed en producción salvo que sea una cuenta demo controlada.
- Si falla el deploy, revisar primero `/api/v1/health`, variables de Railway y logs del servicio API.
