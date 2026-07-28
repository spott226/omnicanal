# next.io by Mercadia — MVP por fases

Este archivo es el punto de arranque para trabajar el MVP sin volver a revisar todo desde cero.

Regla: antes de iniciar una fase, leer este archivo y `docs/MVP_SIMPLIFICATION_RULES.md`.

## Objetivo del MVP

Crear un SaaS simple, estable y vendible donde un negocio pueda:

1. Registrarse.
2. Crear su negocio.
3. Elegir plan mensual o anual.
4. Iniciar prueba gratis de 7 días.
5. Configurar su IA.
6. Cargar información del negocio.
7. Conectar canales en modo mock primero.
8. Recibir conversaciones.
9. Permitir respuesta de IA.
10. Permitir intervención humana.
11. Registrar consumo y aplicar límites.

## Regla de alcance

Conservar:

- Autenticación real.
- Multicliente por organización.
- Planes, suscripciones, trial y Stripe preparado.
- Conversaciones.
- Contactos simples.
- Configuración de IA.
- Base de conocimiento.
- Productos y servicios.
- Canales Instagram, WhatsApp y Facebook en modo claro.
- Equipo básico: Administrador y Agente.
- Facturación y consumo.

Posponer:

- CRM avanzado.
- Embudos complejos.
- Agenda/videollamadas.
- Automatizaciones complejas.
- Reportes decorativos.
- Campañas masivas.
- Inventario/POS/facturación fiscal.
- Integraciones reales de Meta, Stripe e IA hasta su fase.

## Fases propuestas

### Fase 0 — Protección y regla del proyecto

Estado: completada.

Objetivo:

- Crear rama `mvp-simplificado`.
- Guardar snapshot del estado actual.
- Registrar reglas MVP.
- Definir fases.
- No romper ejecución actual.

Entregable:

- `AGENTS.md`
- `README_MVP_FASES.md`
- `docs/MVP_SIMPLIFICATION_RULES.md`
- commit de protección.

### Fase 1 — Limpieza de menú y flujo principal

Estado: completada en primer pase.

Objetivo:

- Reducir navegación al menú MVP:
  1. Inicio
  2. Conversaciones
  3. Contactos
  4. Entrenar IA
  5. Base de conocimiento
  6. Productos y servicios
  7. Conexiones
  8. Equipo
  9. Plan y facturación
  10. Configuración
- Ocultar módulos futuros.
- Quitar métricas inventadas del inicio.
- Mantener pantallas reales conectadas a backend.

Validación:

- Front compila.
- Login funciona.
- Menú no tiene pantallas vacías principales.

### Fase 2 — Registro, negocio y onboarding mínimo

Estado: completada en primer pase.

Objetivo:

- Registro de usuario.
- Creación de negocio.
- Selección de plan mensual/anual.
- Inicio de trial 7 días desde backend.
- Evitar múltiples trials sin regla.

Validación:

- Crear cuenta.
- Crear negocio.
- Ver trial y plan actual.

### Fase 3 — Planes, límites y consumo

Objetivo:

- Centralizar límites por plan en backend/base de datos.
- Registrar consumo por periodo.
- Exponer uso restante.
- Bloquear o advertir límites básicos:
  - usuarios
  - canales
  - respuestas IA
  - contactos

Validación:

- API devuelve límites.
- UI muestra consumo real.
- Backend valida límites.

### Fase 4 — Conversaciones MVP

Objetivo:

- Bandeja conectada a backend.
- Tomar conversación.
- Devolver conversación a IA.
- Cerrar conversación.
- Indicador visible: IA o humano.
- Registrar quién tomó/devolvió.

Validación:

- Mensajes se guardan.
- IA se pausa cuando humano toma control.
- IA se reactiva cuando se devuelve.

### Fase 5 — Configuración de IA y simulador centralizado

Objetivo:

- Crear servicio central `AIProviderService`.
- Modo `AI_PROVIDER_MODE=mock`.
- Configuración por negocio:
  - nombre asistente
  - tono
  - instrucciones
  - mensaje bienvenida
  - fuera de horario
  - temas restringidos
- Simulador usa ese servicio.

Validación:

- Configuración se guarda por organización.
- Simulador responde usando datos del negocio.

### Fase 6 — Knowledge Base y productos/servicios MVP

Objetivo:

- Mantener CRUD simple.
- Separar vista de productos/servicios del resto de conocimiento si ayuda a ventas.
- Sin inventario avanzado.
- Búsqueda simple.

Validación:

- Crear/editar/buscar/desactivar.
- Todo filtrado por organización.

### Fase 7 — Canales en modo mock centralizado

Objetivo:

- Crear `ChannelProviderService`.
- Modo `CHANNEL_PROVIDER_MODE=mock`.
- Mostrar estados reales:
  - No conectado
  - En configuración
  - Conectado mock
  - Error
  - Token vencido
- No fingir conexión real a Meta.

Validación:

- UI indica claramente modo mock.
- Backend no llama Meta.

### Fase 8 — Billing mock y Stripe preparado

Objetivo:

- Crear `BillingProviderService`.
- Modo `BILLING_PROVIDER_MODE=mock`.
- Simular:
  - activar plan
  - cambiar plan
  - cancelar renovación
  - renovar
  - vencer trial
- Mantener estructura Stripe lista.

Validación:

- Plan cambia desde backend.
- Estado afecta acceso.

### Fase 9 — Control de acceso por suscripción

Objetivo:

- Guard/middleware backend.
- Validar:
  - trial vigente
  - suscripción activa
  - pago pendiente
  - límites por plan
  - función permitida

Validación:

- Backend bloquea funciones aunque el frontend muestre botones.

### Fase 10 — Preparación para integraciones reales

Objetivo:

- Documentar y preparar conexión real:
  - OpenAI u otro proveedor IA.
  - Meta.
  - Stripe.
- No activar sin credenciales ni autorización.

Orden recomendado:

1. Stripe real.
2. IA real.
3. Meta real.

Meta se conecta al final porque depende de suscripción, límites, IA y canales bien modelados.

## Comandos de validación

```powershell
npm.cmd run typecheck
npm.cmd run test:web
npm.cmd run test:api
```

## Comandos locales

```powershell
npm.cmd run db:start
npm.cmd run dev:api
npm.cmd run dev:web
```
