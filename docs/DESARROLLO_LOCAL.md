# Desarrollo local

Requisitos: Node 22.13+, Docker Desktop y npm.

1. Copia `.env.example` a `.env` y reemplaza los secretos locales.
2. Ejecuta `docker compose up -d postgres redis`.
3. Ejecuta `npm install`, `npm run db:generate`, `npm run db:migrate` y `npm run db:seed`.
4. En terminales separadas ejecuta `npm run dev:api` y `npm run dev:web`.
5. Abre `http://localhost:3000` y usa `demo@nexoia.local` / `NexoDemo2026!` únicamente en desarrollo.

Validación: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:web` y `npm run build:api`. `npm run demo:reset` solo opera sobre la organización `DEMO`; se bloquea en `NODE_ENV=production` y nunca borra organizaciones `LIVE`.
