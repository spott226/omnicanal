# NexoIA

Preview navegable de un SaaS multiempresa de atención omnicanal y automatización comercial con IA. Funciona sin credenciales externas mediante datos y respuestas simuladas.

## Ejecutar localmente

Requisitos: Node.js 22.13 o superior.

```bash
npm install
npm run dev
```

Abre la dirección local indicada. Usa `demo@nexoia.mx`; la contraseña ya aparece precargada. Para una compilación de producción ejecuta `npm run build`.

## Funciones demostrables

- Acceso demo y dashboard.
- 25 conversaciones de Instagram, WhatsApp y Facebook.
- Envío simulado, control de IA, transferencia y clasificación de leads.
- Contactos, automatizaciones, configuración del agente y laboratorio multicanal.
- Estadísticas, canales, agenda ficticia y panel privado de proveedores.
- Diseño adaptable a escritorio, tableta y móvil.

## Documentación

- `docs/ARQUITECTURA.md`
- `docs/MODELO_DATOS.md`
- `docs/PLAN_IMPLEMENTACION.md`
- `docs/INTEGRACION_META.md`

## Despliegue objetivo

La preview puede publicarse como frontend Next.js. Para la versión SaaS, despliega el frontend en Vercel; crea servicios separados en Railway para API NestJS y worker, y agrega PostgreSQL y Redis. Configura las variables de `.env.example` en cada entorno. Ejecuta migraciones Prisma antes de promover una nueva versión.

No conectes Meta hasta disponer de credenciales oficiales, permisos aprobados y endpoints HTTPS. Las API keys pertenecen exclusivamente al backend.
