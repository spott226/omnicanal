import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_ORGANIZATION_SLUG = "aurea-labs-demo";
export const DEMO_EMAIL = "demo@nexoia.local";
export const DEMO_PASSWORD = "NexoDemo2026!";
export const DEMO_CONTACT_COUNT = 25;

const prisma = new PrismaClient();
const names = ["Mariana López", "Carlos Mendoza", "Sofía Ramírez", "Diego Torres", "Ana Paula Ruiz", "Jorge Salas", "Renata Flores", "Luis Herrera", "Valeria Cruz", "Miguel Ángel", "Camila Ortiz", "Raúl Navarro", "Fernanda Gil", "Hugo Paredes", "Natalia Soto", "Iván Reyes", "Daniela Mora", "Emilio Vega", "Paola Luna", "Óscar Ríos", "Lucía Campos", "Adrián Silva", "Mónica Lara", "Marco Núñez", "Andrea León"];
const channels = ["INSTAGRAM", "WHATSAPP", "FACEBOOK"] as const;
const temperatures = ["HOT", "WARM", "COLD", "WARM"] as const;

export async function seedDemo() {
  if (process.env.NODE_ENV === "production") throw new Error("El seed demo está bloqueado en producción");
  const passwordHash = await hash(DEMO_PASSWORD, 12);
  const organization = await prisma.organization.upsert({ where: { slug: DEMO_ORGANIZATION_SLUG }, update: { name: "Áurea Labs", mode: "DEMO", status: "ACTIVE", plan: "PRO" }, create: { name: "Áurea Labs", slug: DEMO_ORGANIZATION_SLUG, mode: "DEMO", status: "ACTIVE", plan: "PRO" } });
  const user = await prisma.user.upsert({ where: { email: DEMO_EMAIL }, update: { name: "Leniel", passwordHash, status: "ACTIVE" }, create: { name: "Leniel", email: DEMO_EMAIL, passwordHash, status: "ACTIVE" } });
  await prisma.membership.upsert({ where: { organizationId_userId: { organizationId: organization.id, userId: user.id } }, update: { role: "ORGANIZATION_ADMIN" }, create: { organizationId: organization.id, userId: user.id, role: "ORGANIZATION_ADMIN" } });

  const tagData = [["Plan Pro", "#2d8676"], ["Equipo", "#2879dc"], ["Cita agendada", "#e47c61"], ["Prospecto", "#d3a02b"]] as const;
  const tags = await Promise.all(tagData.map(([name, color]) => prisma.tag.upsert({ where: { organizationId_name: { organizationId: organization.id, name } }, update: { color }, create: { organizationId: organization.id, name, color } })));

  for (let index = 0; index < names.length; index += 1) {
    const [firstName, ...last] = names[index].split(" ");
    const external = `demo-contact-${index + 1}@nexoia.local`;
    let contact = await prisma.contact.findFirst({ where: { organizationId: organization.id, email: external } });
    contact = contact ? await prisma.contact.update({ where: { id: contact.id }, data: { firstName, lastName: last.join(" "), leadTemperature: temperatures[index % temperatures.length], leadScore: Math.max(32, 92 - ((index * 7) % 58)), lastInteractionAt: new Date(Date.now() - index * 3_600_000) } }) : await prisma.contact.create({ data: { organizationId: organization.id, firstName, lastName: last.join(" "), email: external, instagramUsername: index % 3 === 0 ? `nexo_demo_${index + 1}` : null, whatsappId: index % 3 === 1 ? `demo-wa-${index + 1}` : null, facebookId: index % 3 === 2 ? `demo-fb-${index + 1}` : null, leadTemperature: temperatures[index % temperatures.length], leadScore: Math.max(32, 92 - ((index * 7) % 58)), consentStatus: "OPTED_IN", lastInteractionAt: new Date(Date.now() - index * 3_600_000) } });
    const existingConversation = await prisma.conversation.findFirst({ where: { organizationId: organization.id, contactId: contact.id, channel: channels[index % channels.length] } });
    const conversation = existingConversation ?? await prisma.conversation.create({ data: { organizationId: organization.id, contactId: contact.id, channel: channels[index % channels.length], status: "OPEN", aiStatus: index % 6 === 3 ? "TRANSFERRED" : "ACTIVE", assignedUserId: index % 6 === 3 ? user.id : null, summary: index === 0 ? "Quiere responder más rápido, centralizar canales y aceptó una videollamada." : "Prospecto demo con historial coherente y datos aislados por organización.", lastMessageAt: new Date(Date.now() - index * 3_600_000) } });
    if ((await prisma.message.count({ where: { organizationId: organization.id, conversationId: conversation.id } })) === 0) {
      await prisma.message.createMany({ data: [
        { organizationId: organization.id, conversationId: conversation.id, direction: "INBOUND", senderType: "CONTACT", content: index === 0 ? "Hola, vi su publicación y quiero información." : "Hola, me interesa conocer cómo funciona NexoIA.", status: "READ", createdAt: new Date(Date.now() - (index + 3) * 3_600_000) },
        { organizationId: organization.id, conversationId: conversation.id, direction: "OUTBOUND", senderType: "AI", content: "Gracias por escribir. ¿Qué te gustaría mejorar en tu atención a clientes?", status: "DELIVERED", createdAt: new Date(Date.now() - (index + 2) * 3_600_000) },
        { organizationId: organization.id, conversationId: conversation.id, direction: "INBOUND", senderType: "CONTACT", content: index === 0 ? "Quiero responder más rápido y no perder clientes." : "Queremos centralizar mensajes y dar seguimiento.", status: "READ", createdAt: new Date(Date.now() - (index + 1) * 3_600_000) },
      ] });
    }
    await prisma.contactTag.upsert({ where: { organizationId_contactId_tagId: { organizationId: organization.id, contactId: contact.id, tagId: tags[index % tags.length].id } }, update: {}, create: { organizationId: organization.id, contactId: contact.id, tagId: tags[index % tags.length].id } });
    if (index < 12) {
      const exists = await prisma.appointment.findFirst({ where: { organizationId: organization.id, contactId: contact.id } });
      if (!exists) await prisma.appointment.create({ data: { organizationId: organization.id, contactId: contact.id, conversationId: conversation.id, scheduledAt: new Date(Date.now() + (index + 1) * 86_400_000), status: "CONFIRMED", meetingUrl: `https://meet.example/demo-${index + 1}` } });
    }
  }

  if (!(await prisma.prompt.findFirst({ where: { organizationId: organization.id } }))) {
    const prompt = await prisma.prompt.create({ data: { organizationId: organization.id, agentName: "Nia" } });
    const version = await prisma.promptVersion.create({ data: { organizationId: organization.id, promptId: prompt.id, versionNumber: 1, content: "Eres Nia, asistente comercial de Áurea Labs. Responde de forma cercana, breve y segura. Haz una pregunta por mensaje.", status: "PUBLISHED", createdBy: user.id, publishedAt: new Date() } });
    await prisma.prompt.update({ where: { id: prompt.id }, data: { publishedVersionId: version.id } });
  }
  if ((await prisma.automation.count({ where: { organizationId: organization.id } })) === 0) {
    await prisma.automation.createMany({ data: [
      { organizationId: organization.id, name: "Comentario VIP → Mensaje privado", channel: "INSTAGRAM", triggerType: "KEYWORD", configuration: { keyword: "VIP", action: "SEND_PRIVATE_MESSAGE" }, active: true },
      { organizationId: organization.id, name: "Mensaje INFO → Calificación", channel: "WHATSAPP", triggerType: "KEYWORD", configuration: { keyword: "INFO", action: "START_QUALIFICATION" }, active: true },
      { organizationId: organization.id, name: "Avisar prospecto caliente", triggerType: "LEAD_SCORE", configuration: { score: 75, action: "NOTIFY_SUPERVISOR" }, active: true },
    ] });
  }
  const planPrices = [
    ["STARTER", "MONTHLY", 99000, 1000, 3],
    ["PRO", "MONTHLY", 199000, 3000, 10],
    ["ENTERPRISE", "MONTHLY", 349000, 10000, 25],
    ["STARTER", "YEARLY", 948000, 1000, 3],
    ["PRO", "YEARLY", 1908000, 3000, 10],
    ["ENTERPRISE", "YEARLY", 3348000, 10000, 25],
  ] as const;
  for (const [plan, interval, amountCents, monthlyContactsLimit, seatsLimit] of planPrices) {
    await prisma.planPrice.upsert({ where: { plan_interval: { plan, interval } }, update: { currency: "MXN", amountCents, monthlyContactsLimit, seatsLimit, active: true }, create: { plan, interval, currency: "MXN", amountCents, monthlyContactsLimit, seatsLimit } });
  }
  const proMonthly = await prisma.planPrice.findUniqueOrThrow({ where: { plan_interval: { plan: "PRO", interval: "MONTHLY" } } });
  if (!(await prisma.subscription.findFirst({ where: { organizationId: organization.id } }))) {
    const now = new Date();
    await prisma.subscription.create({ data: { organizationId: organization.id, planPriceId: proMonthly.id, status: "TRIALING", trialStartedAt: now, trialEndsAt: new Date(now.getTime() + 7 * 86_400_000), currentPeriodStartsAt: now, currentPeriodEndsAt: new Date(now.getTime() + 7 * 86_400_000) } });
  }
  return { organizationId: organization.id, contacts: await prisma.contact.count({ where: { organizationId: organization.id } }), appointments: await prisma.appointment.count({ where: { organizationId: organization.id } }) };
}

const executedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (executedDirectly) seedDemo().then((result) => console.log("Seed demo listo", result)).finally(() => prisma.$disconnect());
