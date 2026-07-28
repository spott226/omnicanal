# Despliegue preparado

## Railway: API, PostgreSQL y Redis

Crea servicios PostgreSQL y Redis, después un servicio para este repositorio con `railway.toml`. Configura `DATABASE_URL`, `REDIS_URL`, secretos independientes de al menos 32 caracteres, `APP_ENCRYPTION_KEY`, URLs y CORS. El predeploy ejecuta `prisma migrate deploy`; no ejecutes migraciones desde cada réplica. Verifica `/api/v1/health`.

## Vercel: frontend

Importa el repositorio como Next.js usando `vercel.json`. Configura `NEXT_PUBLIC_API_URL=https://api.tudominio.com/api/v1`. En Railway configura `FRONTEND_URL` y `CORS_ORIGIN` con el dominio exacto de Vercel. Usa dominios separados `app.*` y `api.*`, ambos HTTPS.

No se despliega automáticamente desde esta fase. Antes de promover: migración en staging, seed solo en entornos demo, pruebas, smoke test, respaldo y plan de reversión. Nunca copies `.env` al repositorio.
