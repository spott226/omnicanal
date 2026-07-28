# Reglas de simplificación MVP

Este documento resume la regla principal del producto. No reemplaza decisiones técnicas puntuales, pero sí define el alcance.

## Producto

`next.io by Mercadia` será un SaaS omnicanal con IA para negocios. No busca competir todavía con plataformas completas como Respond.io.

El recorrido principal del MVP es:

**Usuario se registra → crea negocio → elige plan mensual o anual → inicia prueba gratuita → configura su IA → carga información del negocio → recibe conversación → IA responde → humano puede intervenir → sistema registra consumo y controla límites.**

## No negociar

No eliminar:

- Planes.
- Suscripciones.
- Prueba gratuita de 7 días.
- Selección mensual/anual.
- Estructura de Stripe.
- Estado de suscripción.
- Control de límites.
- Autenticación real.
- Multicliente por negocio.
- Bandeja de conversaciones.
- Contactos básicos.
- Configuración de IA.
- Base de conocimiento.
- Productos y servicios.
- Canales.
- Equipo básico.

## Modos mock centralizados

Usar servicios centrales:

- `AIProviderService`
- `ChannelProviderService`
- `BillingProviderService`

Variables:

```env
AI_PROVIDER_MODE=mock
CHANNEL_PROVIDER_MODE=mock
BILLING_PROVIDER_MODE=mock
```

Valores futuros:

```env
AI_PROVIDER_MODE=openai
CHANNEL_PROVIDER_MODE=meta
BILLING_PROVIDER_MODE=stripe
```

No mezclar mocks con lógica real. La UI debe decir claramente cuando algo está en modo demo/mock.

## Menú MVP

Menú esperado:

1. Inicio.
2. Conversaciones.
3. Contactos.
4. Entrenar IA.
5. Base de conocimiento.
6. Productos y servicios.
7. Conexiones.
8. Equipo.
9. Plan y facturación.
10. Configuración.

Ocultar o marcar como “Próximamente” lo que no sea parte del MVP.

## Backend primero

No basta con ocultar botones.

El backend debe validar:

- Organización/tenant.
- Rol.
- Estado de trial.
- Estado de suscripción.
- Límites por plan.
- Propiedad de registros.

## Roles MVP

Solo dos roles principales:

- Administrador.
- Agente.

No crear permisos avanzados todavía salvo que ya existan y no estorben.

## Inicio

Mostrar solo datos reales o claramente marcados como mock:

- Conversaciones abiertas.
- Atendidas por IA.
- Atendidas por humano.
- Contactos.
- Estado conexiones.
- Plan actual.
- Días restantes de prueba.
- Uso y límites.
- Fecha de renovación.

No mostrar ingresos, ventas, embudos o gráficas decorativas inventadas.

## Funciones a posponer

Posponer:

- CRM avanzado.
- Embudos complejos.
- Pronósticos.
- Agenda y videollamadas.
- Calendarios complejos.
- Campañas masivas.
- Automatizaciones visuales complejas.
- Reportes avanzados.
- Inventario.
- Punto de venta.
- Facturación fiscal/CFDI.
- Integraciones reales sin credenciales.

## Seguridad

Mantener:

- Passwords cifradas.
- Sesiones seguras.
- CSRF/CORS si aplica.
- Validación de entrada.
- Rate limits.
- Secretos fuera del frontend.
- No mostrar claves en logs.

## Conexión real de proveedores

Orden recomendado:

1. Stripe real.
2. IA real.
3. Meta real.

Meta va al final porque requiere canales, límites, suscripción e IA estables.
