export const DEMO_ORGANIZATION_ID = "org_aurea_labs_demo";

export const DEMO_METRICS = {
  conversations: 1284,
  newLeads: 347,
  contacted: 271,
  qualified: 181,
  hotLeads: 89,
  appointments: 12,
  handledByAI: 1052,
  transferredToHuman: 232,
  firstResponseSeconds: 8,
  savedHours: 94,
  inputTokens: 2_400_000,
  outputTokens: 486_000,
  estimatedCostUSD: 38.42,
  automationsRun: 582,
} as const;

export const CHANNEL_DATA = {
  instagram: { label: "Instagram", short: "IG", count: 591, percentage: 46, color: "#b54fc8" },
  whatsapp: { label: "WhatsApp", short: "WA", count: 488, percentage: 38, color: "#21ad67" },
  facebook: { label: "Facebook", short: "FB", count: 205, percentage: 16, color: "#2677d9" },
} as const;

export const FUNNEL = [
  { label: "Nuevos", value: DEMO_METRICS.newLeads, explanation: "Prospectos creados durante el mes" },
  { label: "Contactados", value: DEMO_METRICS.contacted, explanation: "Recibieron al menos una respuesta" },
  { label: "Calificados", value: DEMO_METRICS.qualified, explanation: "Tienen necesidad e interés identificados" },
  { label: "Calientes", value: DEMO_METRICS.hotLeads, explanation: "Alta intención y puntuación comercial" },
  { label: "Citas", value: DEMO_METRICS.appointments, explanation: "Aceptaron una videollamada" },
] as const;

export const DAILY_CHANNELS = [
  [18,14,7],[22,16,8],[20,15,7],[27,20,9],[24,18,9],[30,23,10],[28,21,10],
  [32,24,11],[25,19,9],[34,25,12],[29,22,10],[38,27,13],[33,24,12],[41,29,14],
].map(([instagram, whatsapp, facebook], index) => ({
  date: `${7 + index} jul`, instagram, whatsapp, facebook,
  total: instagram + whatsapp + facebook,
}));

export const newLeadToAppointmentRate = Number(((DEMO_METRICS.appointments / DEMO_METRICS.newLeads) * 100).toFixed(1));
export const hotLeadToAppointmentRate = Number(((DEMO_METRICS.appointments / DEMO_METRICS.hotLeads) * 100).toFixed(1));
export const channelPercentageTotal = Object.values(CHANNEL_DATA).reduce((sum, channel) => sum + channel.percentage, 0);
export const hasNegativeDailyValue = DAILY_CHANNELS.some(day => day.instagram < 0 || day.whatsapp < 0 || day.facebook < 0 || day.total < 0);

export const DEMO_AUTOMATIONS = [
  { name: "Comentario VIP → Mensaje privado", channel: "instagram", trigger: "Comentario contiene “VIP”", action: "Enviar mensaje privado", runs: 284, active: true },
  { name: "Mensaje INFO → Calificación", channel: "facebook", trigger: "Mensaje contiene “INFO”", action: "Iniciar calificación", runs: 167, active: true },
  { name: "Avisar prospecto caliente", channel: "whatsapp", trigger: "Lead alcanza 75 puntos", action: "Notificar a un asesor", runs: 89, active: true },
  { name: "Acepta cita → Agenda", channel: "instagram", trigger: "Prospecto acepta una cita", action: "Mostrar horarios disponibles", runs: 31, active: true },
  { name: "Seguimiento sin respuesta", channel: "whatsapp", trigger: "Sin respuesta durante 48 h", action: "Programar recordatorio", runs: 42, active: false },
  { name: "BAJA → Cancelar promociones", channel: "facebook", trigger: "Mensaje contiene “BAJA”", action: "Cancelar promociones", runs: 18, active: true },
] as const;
