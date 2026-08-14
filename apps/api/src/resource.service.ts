import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { AIProviderService } from "./ai-provider.service";
import { PrismaService } from "./prisma.service";
import type { AISimulateDto, AppointmentDto, AutomationDto, CreateContactDto, CreateNoteDto, CreateTagDto, InviteMemberDto, PageQueryDto, PromptDto, ReminderDto, SendMessageDto, UpdateContactDto, UpdateMemberRoleDto, UpdateOrganizationDto } from "./resource.dto";

export function safePercentage(part: number, total: number) { return total > 0 ? Number(((Math.max(0, part) / total) * 100).toFixed(1)) : 0; }

@Injectable()
export class ResourceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AIProviderService) private readonly aiProvider?: AIProviderService, @Optional() @Inject(ConfigService) private readonly config?: ConfigService) {}
  private org(principal: AuthPrincipal) { if (!principal.organizationId) throw new ForbiddenException("Organización requerida"); return principal.organizationId; }
  private normalizedPage(query: PageQueryDto) { const page = Number.isInteger(query.page) && query.page > 0 ? query.page : 1; const pageSize = Number.isInteger(query.pageSize) && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25; return { page, pageSize }; }
  private paging(query: PageQueryDto) { const { page, pageSize } = this.normalizedPage(query); return { skip: (page - 1) * pageSize, take: pageSize }; }

  currentOrganization(principal: AuthPrincipal) {
    return (this.prisma as any).organization.findUniqueOrThrow({ where: { id: this.org(principal) }, select: { id: true, name: true, slug: true, status: true, mode: true, plan: true, timezone: true, industry: true, website: true, description: true, notificationSettings: true, securitySettings: true } });
  }

  async updateOrganization(principal: AuthPrincipal, dto: UpdateOrganizationDto) {
    const organizationId = this.org(principal);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.timezone !== undefined) data.timezone = dto.timezone.trim();
    if (dto.industry !== undefined) data.industry = dto.industry.trim() || null;
    if (dto.website !== undefined) data.website = dto.website.trim() || null;
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.notificationSettings !== undefined) data.notificationSettings = dto.notificationSettings as Prisma.InputJsonValue;
    if (dto.securitySettings !== undefined) data.securitySettings = dto.securitySettings as Prisma.InputJsonValue;
    const organization = await (this.prisma as any).organization.update({ where: { id: organizationId }, data, select: { id: true, name: true, slug: true, status: true, mode: true, plan: true, timezone: true, industry: true, website: true, description: true, notificationSettings: true, securitySettings: true } });
    await this.audit(principal, "ORGANIZATION_SETTINGS_UPDATED", "Organization", organizationId);
    return organization;
  }

  teamMembers(principal: AuthPrincipal) {
    return (this.prisma as any).membership.findMany({ where: { organizationId: this.org(principal) }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, email: true, status: true, createdAt: true } } } });
  }

  async inviteMember(principal: AuthPrincipal, dto: InviteMemberDto) {
    const organizationId = this.org(principal);
    await this.ensureSeatLimit(organizationId);
    const email = dto.email.toLowerCase().trim();
    const temporaryPassword = `Next-${randomUUID().slice(0, 8)}!`;
    const passwordHash = await hash(temporaryPassword, 12);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) user = await tx.user.create({ data: { name: dto.name.trim(), email, passwordHash, status: "ACTIVE" } });
      const existing = await (tx as any).membership.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } });
      if (existing) throw new ConflictException("Este usuario ya pertenece al equipo");
      const membership = await (tx as any).membership.create({ data: { organizationId, userId: user.id, role: dto.role }, include: { user: { select: { id: true, name: true, email: true, status: true, createdAt: true } } } });
      await tx.auditLog.create({ data: { organizationId, userId: principal.userId, action: "TEAM_MEMBER_INVITED", entityType: "Membership", entityId: membership.id, metadata: { email, role: dto.role } } });
      return { ...membership, temporaryPassword };
    });
  }

  async updateMemberRole(principal: AuthPrincipal, membershipId: string, dto: UpdateMemberRoleDto) {
    const organizationId = this.org(principal);
    const membership = await (this.prisma as any).membership.findFirst({ where: { id: membershipId, organizationId }, include: { user: true } });
    if (!membership) throw new NotFoundException("Miembro no encontrado");
    if (membership.userId === principal.userId && dto.role !== "ORGANIZATION_ADMIN") throw new ForbiddenException("No puedes quitarte tu propio rol administrador");
    const updated = await (this.prisma as any).membership.update({ where: { id: membershipId }, data: { role: dto.role }, include: { user: { select: { id: true, name: true, email: true, status: true, createdAt: true } } } });
    await this.audit(principal, "TEAM_MEMBER_ROLE_UPDATED", "Membership", membershipId);
    return updated;
  }

  async removeMember(principal: AuthPrincipal, membershipId: string) {
    const organizationId = this.org(principal);
    const membership = await (this.prisma as any).membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!membership) throw new NotFoundException("Miembro no encontrado");
    if (membership.userId === principal.userId) throw new ForbiddenException("No puedes eliminarte de tu propio equipo");
    await (this.prisma as any).membership.delete({ where: { id: membershipId } });
    await this.audit(principal, "TEAM_MEMBER_REMOVED", "Membership", membershipId);
    return { ok: true };
  }

  async dashboard(principal: AuthPrincipal) {
    const organizationId = this.org(principal); const now = new Date(); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [conversations, newLeads, hotLeads, appointments, aiHandled, humanHandled, contacts, contacted, qualified, byChannel] = await Promise.all([
      this.prisma.conversation.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
      this.prisma.contact.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
      this.prisma.contact.count({ where: { organizationId, leadTemperature: "HOT" } }),
      this.prisma.appointment.count({ where: { organizationId, scheduledAt: { gte: monthStart } } }),
      this.prisma.conversation.count({ where: { organizationId, aiStatus: "ACTIVE" } }),
      this.prisma.conversation.count({ where: { organizationId, aiStatus: "TRANSFERRED" } }),
      this.prisma.contact.count({ where: { organizationId } }),
      this.prisma.contact.count({ where: { organizationId, conversations: { some: {} } } }),
      this.prisma.contact.count({ where: { organizationId, leadScore: { gte: 50 } } }),
      this.prisma.conversation.groupBy({ by: ["channel"], where: { organizationId, createdAt: { gte: monthStart } }, _count: { _all: true } }),
    ]);
    return { conversations, newLeads, hotLeads, appointments, aiHandled, humanHandled, byChannel: byChannel.map((row: { channel: string; _count: { _all: number } }) => ({ channel: row.channel, count: Math.max(0, row._count._all), percentage: safePercentage(row._count._all, conversations) })), funnel: { contacts, contacted, qualified, hot: hotLeads, appointments }, conversion: { newLeadToAppointment: safePercentage(appointments, newLeads), hotToAppointment: safePercentage(appointments, hotLeads) } };
  }

  async platformOverview(principal: AuthPrincipal) {
    if (principal.role !== "SUPER_ADMIN") throw new ForbiddenException("Solo el superadministrador puede consultar la plataforma");
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [organizations, aiUsage, conversations] = await Promise.all([
      this.prisma.organization.findMany({ orderBy: { createdAt: "desc" }, include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { planPrice: true } }, metaConnections: { where: { status: "CONNECTED" }, select: { provider: true } }, _count: { select: { memberships: true, conversations: true, contacts: true } } } }),
      this.prisma.aIUsageRecord.groupBy({ by: ["organizationId"], where: { createdAt: { gte: monthStart }, status: "SUCCEEDED" }, _sum: { inputTokens: true, outputTokens: true, estimatedCost: true }, _count: { _all: true } }),
      this.prisma.conversation.groupBy({ by: ["organizationId"], where: { createdAt: { gte: monthStart } }, _count: { _all: true } }),
    ]);
    const aiByOrganization = new Map(aiUsage.map((row: any) => [row.organizationId, { inputTokens: row._sum.inputTokens ?? 0, outputTokens: row._sum.outputTokens ?? 0, estimatedCostUsd: Number(row._sum.estimatedCost ?? 0), replies: row._count._all }]));
    const conversationsByOrganization = new Map(conversations.map((row: any) => [row.organizationId, row._count._all]));
    const clients = organizations.map((organization: any) => {
      const subscription = organization.subscriptions[0] ?? null;
      const ai = aiByOrganization.get(organization.id) ?? { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, replies: 0 };
      const periodConversations = conversationsByOrganization.get(organization.id) ?? 0;
      const limit = subscription?.status === "TRIALING" ? 20 : subscription?.planPrice?.monthlyContactsLimit ?? 0;
      return { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status, createdAt: organization.createdAt, subscription: subscription ? { status: subscription.status, plan: subscription.planPrice.plan, interval: subscription.planPrice.interval, amountCents: subscription.planPrice.amountCents, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd } : null, usage: { conversations: periodConversations, conversationLimit: limit, aiReplies: ai.replies, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, estimatedCostUsd: ai.estimatedCostUsd }, channels: organization.metaConnections.map((connection: any) => connection.provider), members: organization._count.memberships, contacts: organization._count.contacts, conversationsTotal: organization._count.conversations };
    });
    const paying = clients.filter((client: any) => client.subscription?.status === "ACTIVE");
    const estimatedMrrCents = paying.reduce((total: number, client: any) => total + (client.subscription.interval === "YEARLY" ? Math.round(client.subscription.amountCents / 12) : client.subscription.amountCents), 0);
    return { generatedAt: new Date().toISOString(), summary: { organizations: clients.length, activeOrganizations: clients.filter((client: any) => client.status === "ACTIVE").length, payingOrganizations: paying.length, trials: clients.filter((client: any) => client.subscription?.status === "TRIALING").length, estimatedMrrCents, aiInputTokens: clients.reduce((total: number, client: any) => total + client.usage.inputTokens, 0), aiOutputTokens: clients.reduce((total: number, client: any) => total + client.usage.outputTokens, 0), estimatedAiCostUsd: clients.reduce((total: number, client: any) => total + client.usage.estimatedCostUsd, 0) }, clients };
  }

  async contacts(principal: AuthPrincipal, query: PageQueryDto) {
    const organizationId = this.org(principal); const where = { organizationId, ...(query.search ? { OR: [{ firstName: { contains: query.search, mode: "insensitive" as const } }, { lastName: { contains: query.search, mode: "insensitive" as const } }, { email: { contains: query.search, mode: "insensitive" as const } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.contact.findMany({ where, ...this.paging(query), orderBy: { lastInteractionAt: query.sort === "asc" ? "asc" : "desc" }, include: { tags: { include: { tag: true } } } }), this.prisma.contact.count({ where })]);
    const page = this.normalizedPage(query);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }
  async createContact(principal: AuthPrincipal, dto: CreateContactDto) { const organizationId = this.org(principal); return this.prisma.contact.create({ data: { ...dto, organizationId } }); }
  async updateContact(principal: AuthPrincipal, id: string, dto: UpdateContactDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, id); return this.prisma.contact.update({ where: { id }, data: dto }); }
  async deleteContact(principal: AuthPrincipal, id: string) { const organizationId = this.org(principal); await this.requireContact(organizationId, id); await this.prisma.contact.delete({ where: { id } }); return { ok: true }; }

  async conversations(principal: AuthPrincipal, query: PageQueryDto) {
    const organizationId = this.org(principal); const where = { organizationId, ...(principal.role === "AGENT" ? { assignedUserId: principal.userId } : {}), ...(query.search ? { contact: { OR: [{ firstName: { contains: query.search, mode: "insensitive" as const } }, { lastName: { contains: query.search, mode: "insensitive" as const } }] } } : {}) };
    const [items, total] = await Promise.all([this.prisma.conversation.findMany({ where, ...this.paging(query), orderBy: { lastMessageAt: query.sort === "asc" ? "asc" : "desc" }, include: { contact: true, messages: { take: 1, orderBy: { createdAt: "desc" } } } }), this.prisma.conversation.count({ where })]);
    const page = this.normalizedPage(query);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }
  async conversation(principal: AuthPrincipal, id: string) { const item = await this.prisma.conversation.findFirst({ where: { id, organizationId: this.org(principal), ...(principal.role === "AGENT" ? { assignedUserId: principal.userId } : {}) }, include: { contact: { include: { tags: { include: { tag: true } }, notes: { orderBy: { createdAt: "desc" } } } }, messages: { orderBy: { createdAt: "asc" } }, appointments: true, reminders: true } }); if (!item) throw new NotFoundException("Conversación no encontrada"); return item; }
  async sendMessage(principal: AuthPrincipal, id: string, dto: SendMessageDto) {
    const organizationId = this.org(principal);
    const conversation = await this.conversation(principal, id);
    const message = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.message.create({ data: { organizationId, conversationId: conversation.id, direction: "OUTBOUND", senderType: "USER", content: dto.content, status: "PENDING" } });
      await tx.conversation.update({ where: { id }, data: { lastMessageAt: created.createdAt } });
      return created;
    });
    const delivery = await this.deliverOutboundMessage(conversation, dto.content);
    const saved = await this.prisma.message.update({
      where: { id: message.id },
      data: { status: delivery.sent ? "SENT" : "FAILED", ...(delivery.externalMessageId ? { externalMessageId: delivery.externalMessageId } : {}) },
    });
    await this.audit(principal, delivery.sent ? "HUMAN_MESSAGE_SENT" : "HUMAN_MESSAGE_FAILED", "Conversation", id, { channel: conversation.channel, delivery: delivery.status });
    return { ...saved, delivery: delivery.status };
  }
  async aiReply(principal: AuthPrincipal, id: string) {
    const organizationId = this.org(principal);
    const conversation = await this.conversation(principal, id);
    const allowance = await this.ensureAiAllowance(organizationId);
    if (!allowance.allowed) throw new ForbiddenException(allowance.message);
    return this.generateAiReply({ organizationId, conversation, manual: true, principal });
  }

  async autoReplyFromInbound(organizationId: string, conversationId: string, inboundText: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      include: { contact: { include: { tags: { include: { tag: true } }, notes: { orderBy: { createdAt: "desc" } } } }, messages: { orderBy: { createdAt: "asc" } }, appointments: true, reminders: true },
    });
    if (!conversation || conversation.status === "CLOSED") return { replied: false, reason: "conversation_unavailable" };
    if (conversation.aiStatus !== "ACTIVE") return { replied: false, reason: "human_control" };
    const last = [...conversation.messages].reverse()[0];
    if (!last || last.senderType !== "CONTACT") return { replied: false, reason: "last_message_not_contact" };
    if (this.shouldTransferToHuman(inboundText)) {
      const systemMessage = await this.prisma.message.create({
        data: {
          organizationId,
          conversationId,
          direction: "OUTBOUND",
          senderType: "SYSTEM",
          content: "La IA detecto que esta conversacion necesita atencion humana y quedo pausada.",
          status: "SENT",
        },
      });
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { aiStatus: "TRANSFERRED", lastMessageAt: systemMessage.createdAt } });
      return { replied: false, reason: "transferred_to_human" };
    }

    const allowance = await this.ensureAiAllowance(organizationId);
    if (!allowance.allowed) {
      const systemMessage = await this.prisma.message.create({
        data: {
          organizationId,
          conversationId,
          direction: "OUTBOUND",
          senderType: "SYSTEM",
          content: allowance.message,
          status: "SENT",
        },
      });
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { aiStatus: "PAUSED", lastMessageAt: systemMessage.createdAt } });
      return { replied: false, reason: allowance.reason };
    }

    return this.generateAiReply({ organizationId, conversation, manual: false });
  }

  private async generateAiReply(input: { organizationId: string; conversation: any; manual: boolean; principal?: AuthPrincipal }) {
    const { organizationId, conversation } = input;
    const id = String(conversation.id);
    if (conversation.status === "CLOSED") throw new BadRequestException("No se puede responder una conversacion cerrada");
    const inbound = [...conversation.messages].reverse().find((message: any) => message.senderType === "CONTACT");
    if (!inbound?.content?.trim()) throw new BadRequestException("La conversacion no tiene mensaje entrante para responder");
    if (!input.manual && conversation.aiStatus !== "ACTIVE") return { replied: false, reason: "human_control" };
    const startedAt = Date.now();
    const [organization, prompt, faqs, products, services, promotions, schedules, policies] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, timezone: true, industry: true, website: true, description: true } }),
      this.prisma.prompt.findFirst({ where: { organizationId, active: true }, include: { publishedVersion: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }),
      this.prisma.faq.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }], take: 8 }),
      this.prisma.product.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 8 }),
      this.prisma.service.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 8 }),
      this.prisma.promotion.findMany({ where: { organizationId, active: true, deletedAt: null, endsAt: { gte: new Date() } }, orderBy: { endsAt: "asc" }, take: 6 }),
      this.prisma.businessSchedule.findMany({ where: { organizationId, active: true, deletedAt: null }, include: { entries: { where: { deletedAt: null }, orderBy: { dayOfWeek: "asc" } } }, orderBy: { updatedAt: "desc" }, take: 3 }),
      this.prisma.policy.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 8 }),
    ]);
    const knowledgeContext = this.buildAiKnowledgeContext({ organization, faqs, products, services, promotions, schedules, policies });
    const provider = this.aiProvider ?? new AIProviderService({ get: () => "mock" } as any);
    const result = await provider.simulate({ agentName: prompt?.agentName ?? "Nia", businessName: organization.name, prompt: prompt?.publishedVersion?.content ?? prompt?.versions?.[0]?.content ?? "", knowledgeContext, message: inbound.content, turn: conversation.messages.filter((message: any) => message.senderType === "CONTACT").length });
    const providerUnavailable = ["configuration", "openai_error", "deepseek_error", "ollama_error"].includes(String((result as any).safety?.source ?? ""));
    if (providerUnavailable) {
      if (input.manual) throw new BadRequestException("La IA no esta disponible todavia. Revisa la clave y el saldo del proveedor.");
      return { replied: false, reason: "provider_unavailable" };
    }
    const reply = result.reply?.trim();
    if (!reply) throw new BadRequestException("La IA no genero respuesta");
    const message = await this.prisma.message.create({ data: { organizationId, conversationId: conversation.id, direction: "OUTBOUND", senderType: "AI", content: reply, status: "PENDING" } });
    const delivery = await this.deliverOutboundMessage(conversation, reply);
    await this.prisma.message.update({ where: { id: message.id }, data: { status: delivery.sent ? "SENT" : "FAILED", ...(delivery.externalMessageId ? { externalMessageId: delivery.externalMessageId } : {}) } });
    await this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: message.createdAt, aiStatus: "ACTIVE", summary: conversation.summary ?? "Respuesta IA generada con contexto del negocio." } });
    const inputTokens = Math.ceil((inbound.content.length + knowledgeContext.length) / 4);
    const outputTokens = Math.ceil(reply.length / 4);
    await this.prisma.aIUsageRecord.create({ data: { organizationId, conversationId: id, provider: result.provider ?? "unknown", model: result.model ?? "unknown", inputTokens, outputTokens, estimatedCost: this.estimateAiCost(inputTokens, outputTokens), latencyMs: Date.now() - startedAt, status: "SUCCEEDED" } });
    if (input.principal) await this.audit(input.principal, delivery.sent ? "AI_REPLY_SENT_TO_META" : "AI_REPLY_CREATED", "Conversation", id, { provider: result.provider, metaDelivery: delivery.status });
    return input.principal ? this.conversation(input.principal, id) : { replied: true, conversationId: id, sent: delivery.sent, status: delivery.status };
  }

  async takeConversation(principal: AuthPrincipal, id: string) { await this.requireConversationForAction(principal, id); return this.changeConversationControl(principal, id, { aiStatus: "TRANSFERRED", assignedUserId: principal.userId, status: "OPEN" }, "CONVERSATION_TAKEN", `${principal.name} tomó la conversacion. La IA quedó pausada.`); }
  async returnConversationToAi(principal: AuthPrincipal, id: string) { await this.requireConversationForAction(principal, id); return this.changeConversationControl(principal, id, { aiStatus: "ACTIVE", assignedUserId: null, status: "OPEN" }, "CONVERSATION_RETURNED_TO_AI", `${principal.name} devolvió la conversacion a la IA.`); }
  async closeConversation(principal: AuthPrincipal, id: string) { await this.requireConversationForAction(principal, id); return this.changeConversationControl(principal, id, { aiStatus: "PAUSED", status: "CLOSED" }, "CONVERSATION_CLOSED", `${principal.name} cerró la conversacion.`); }

  private shouldTransferToHuman(text: string) {
    const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return /\b(humano|asesor|persona|agente|ejecutivo|supervisor|encargado)\b/.test(normalized)
      || /\b(queja|reclamo|molesto|molesta|enojado|enojada|demanda|legal|abogado|fraude)\b/.test(normalized);
  }

  private async ensureAiAllowance(organizationId: string) {
    const subscription = await (this.prisma as any).subscription.findFirst({
      where: { organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "INCOMPLETE"] } },
      orderBy: { createdAt: "desc" },
      include: { planPrice: true },
    });
    if (!subscription) return { allowed: false, reason: "missing_subscription", message: "La IA quedo pausada: la organizacion no tiene suscripcion activa." };
    const now = Date.now();
    const periodStart = new Date(subscription.currentPeriodStartsAt);
    const periodEnd = new Date(subscription.currentPeriodEndsAt);
    if (subscription.status === "TRIALING" && new Date(subscription.trialEndsAt).getTime() <= now) {
      return { allowed: false, reason: "trial_expired", message: "La IA quedo pausada: el periodo de prueba termino. Activa un plan para continuar." };
    }
    if (["INCOMPLETE", "CANCELLED"].includes(subscription.status)) {
      return { allowed: false, reason: "inactive_subscription", message: "La IA quedo pausada: la suscripcion necesita activarse para continuar." };
    }
    const [conversations, aiResponses] = await Promise.all([
      this.prisma.conversation.count({ where: { organizationId, createdAt: { gte: periodStart } } }),
      this.prisma.message.count({ where: { organizationId, senderType: "AI", createdAt: { gte: periodStart, lte: periodEnd } } }),
    ]);
    const conversationLimit = subscription.status === "TRIALING" ? 20 : subscription.planPrice?.monthlyContactsLimit ?? 0;
    const aiLimit = subscription.status === "TRIALING" ? 20 : subscription.planPrice?.aiResponsesLimit ?? conversationLimit;
    if (conversationLimit > 0 && conversations >= conversationLimit) {
      return { allowed: false, reason: "conversation_limit", message: `La IA quedo pausada: se alcanzo el limite de ${conversationLimit} conversaciones del periodo. Activa o sube de plan para continuar.` };
    }
    if (aiLimit > 0 && aiResponses >= aiLimit) {
      return { allowed: false, reason: "ai_limit", message: `La IA quedo pausada: se alcanzo el limite de ${aiLimit} respuestas IA del periodo. Activa o sube de plan para continuar.` };
    }
    return { allowed: true, reason: "ok", message: "" };
  }

  async createNote(principal: AuthPrincipal, dto: CreateNoteDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, dto.contactId); const note = await this.prisma.note.create({ data: { organizationId, contactId: dto.contactId, userId: principal.userId, content: dto.content } }); await this.audit(principal, "NOTE_CREATED", "Note", note.id); return note; }
  tags(principal: AuthPrincipal) { return this.prisma.tag.findMany({ where: { organizationId: this.org(principal) }, orderBy: { name: "asc" } }); }
  createTag(principal: AuthPrincipal, dto: CreateTagDto) { return this.prisma.tag.create({ data: { ...dto, organizationId: this.org(principal) } }); }
  async attachTag(principal: AuthPrincipal, contactId: string, tagId: string) { const organizationId = this.org(principal); await this.requireContact(organizationId, contactId); const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } }); if (!tag) throw new NotFoundException("Etiqueta no encontrada"); return this.prisma.contactTag.upsert({ where: { organizationId_contactId_tagId: { organizationId, contactId, tagId } }, update: {}, create: { organizationId, contactId, tagId } }); }

  prompt(principal: AuthPrincipal) { return this.prisma.prompt.findFirst({ where: { organizationId: this.org(principal), active: true }, include: { publishedVersion: true, versions: { orderBy: { versionNumber: "desc" } } } }); }
  async savePrompt(principal: AuthPrincipal, dto: PromptDto) { const organizationId = this.org(principal); const existing = await this.prisma.prompt.findFirst({ where: { organizationId, active: true }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }); return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => { const prompt = existing ?? await tx.prompt.create({ data: { organizationId, agentName: dto.agentName } }); const version = await tx.promptVersion.create({ data: { organizationId, promptId: prompt.id, versionNumber: (existing?.versions[0]?.versionNumber ?? 0) + 1, content: dto.content, status: dto.publish ? "PUBLISHED" : "DRAFT", createdBy: principal.userId, publishedAt: dto.publish ? new Date() : null } }); if (dto.publish) await tx.prompt.update({ where: { id: prompt.id }, data: { agentName: dto.agentName, publishedVersionId: version.id } }); await tx.auditLog.create({ data: { organizationId, userId: principal.userId, action: dto.publish ? "PROMPT_PUBLISHED" : "PROMPT_SAVED", entityType: "PromptVersion", entityId: version.id } }); return version; }); }
  async simulateAi(principal: AuthPrincipal, dto: AISimulateDto) {
    const organizationId = this.org(principal);
    const [organization, prompt, faqs, products, services, promotions, schedules, policies] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, timezone: true, industry: true, website: true, description: true } }),
      this.prisma.prompt.findFirst({ where: { organizationId, active: true }, include: { publishedVersion: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }),
      this.prisma.faq.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }], take: 8 }),
      this.prisma.product.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 8 }),
      this.prisma.service.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 8 }),
      this.prisma.promotion.findMany({ where: { organizationId, active: true, deletedAt: null, endsAt: { gte: new Date() } }, orderBy: { endsAt: "asc" }, take: 6 }),
      this.prisma.businessSchedule.findMany({ where: { organizationId, active: true, deletedAt: null }, include: { entries: { where: { deletedAt: null }, orderBy: { dayOfWeek: "asc" } } }, orderBy: { updatedAt: "desc" }, take: 3 }),
      this.prisma.policy.findMany({ where: { organizationId, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 8 }),
    ]);
    const knowledgeContext = this.buildAiKnowledgeContext({ organization, faqs, products, services, promotions, schedules, policies });
    const provider = this.aiProvider ?? new AIProviderService({ get: () => "mock" } as any);
    return await provider.simulate({ agentName: prompt?.agentName ?? "Nia", businessName: organization.name, prompt: prompt?.publishedVersion?.content ?? prompt?.versions?.[0]?.content ?? "", knowledgeContext, message: dto.message, turn: dto.turn ?? 0 });
  }

  private buildAiKnowledgeContext(input: {
    organization: { name: string; timezone?: string | null; industry?: string | null; website?: string | null; description?: string | null };
    faqs: Array<{ question: string; answer: string }>;
    products: Array<{ sku: string; name: string; description?: string | null; price?: Prisma.Decimal | null; currency: string }>;
    services: Array<{ code: string; name: string; description?: string | null; price?: Prisma.Decimal | null; currency: string; durationMinutes?: number | null }>;
    promotions: Array<{ code: string; name: string; description?: string | null; discountType: string; discountValue: Prisma.Decimal; startsAt: Date; endsAt: Date }>;
    schedules: Array<{ name: string; timezone: string; entries: Array<{ dayOfWeek: string; opensAt?: string | null; closesAt?: string | null; closed: boolean }> }>;
    policies: Array<{ type: string; title: string; content: string; version: number }>;
  }) {
    const sections = [
      this.section("Negocio", [
        `Nombre: ${input.organization.name}`,
        input.organization.industry ? `Industria: ${input.organization.industry}` : "",
        input.organization.website ? `Sitio web: ${input.organization.website}` : "",
        input.organization.timezone ? `Zona horaria: ${input.organization.timezone}` : "",
        input.organization.description ? `Descripcion: ${input.organization.description}` : "",
      ]),
      this.section("FAQs", input.faqs.map(item => `P: ${item.question}\nR: ${item.answer}`)),
      this.section("Productos", input.products.map(item => `${item.name}${item.sku ? ` (${item.sku})` : ""}${item.price ? ` - ${this.money(item.price, item.currency)}` : " - precio no configurado"}${item.description ? `: ${item.description}` : ""}. Palabras clave: ${this.keywords(item.name, item.sku, item.description)}`)),
      this.section("Servicios", input.services.map(item => `${item.name}${item.code ? ` (${item.code})` : ""}${item.price ? ` - ${this.money(item.price, item.currency)}` : " - precio no configurado"}${item.durationMinutes ? ` - ${item.durationMinutes} min` : ""}${item.description ? `: ${item.description}` : ""}. Palabras clave: ${this.keywords(item.name, item.code, item.description)}`)),
      this.section("Promociones vigentes", input.promotions.map(item => `${item.name} (${item.code}): ${item.description ?? "Sin descripcion"} | Descuento ${item.discountValue.toString()} ${item.discountType} | Vigencia ${this.isoDate(item.startsAt)} a ${this.isoDate(item.endsAt)}`)),
      this.section("Horarios", input.schedules.map(item => {
        const entries = item.entries.map(entry => `${this.dayName(entry.dayOfWeek)}: ${entry.closed ? "cerrado" : `${entry.opensAt ?? "sin apertura"}-${entry.closesAt ?? "sin cierre"}`}`).join("; ");
        return `${item.name} (${item.timezone}): ${entries || "sin dias configurados"}`;
      })),
      this.section("Politicas", input.policies.map(item => `${item.title} [${item.type} v${item.version}]: ${item.content}`)),
    ].filter(Boolean).join("\n\n");
    return this.truncate(sections, 6000);
  }

  private section(title: string, lines: string[]) {
    const clean = lines.map(line => line.trim()).filter(Boolean);
    return clean.length ? `${title}:\n- ${clean.join("\n- ")}` : "";
  }

  private money(value: Prisma.Decimal, currency: string) {
    return `${value.toString()} ${currency}`;
  }

  private isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private truncate(value: string, max: number) {
    return value.length > max ? `${value.slice(0, max - 20)}\n[contexto recortado]` : value;
  }

  private keywords(...values: Array<string | null | undefined>) {
    const words = values.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(word => word.length >= 3);
    return [...new Set(words)].slice(0, 12).join(", ") || "sin palabras clave";
  }

  private dayName(day: string) {
    return ({ MONDAY: "Lunes", TUESDAY: "Martes", WEDNESDAY: "Miercoles", THURSDAY: "Jueves", FRIDAY: "Viernes", SATURDAY: "Sabado", SUNDAY: "Domingo" } as Record<string, string>)[day] ?? day;
  }

  automations(principal: AuthPrincipal) { return this.prisma.automation.findMany({ where: { organizationId: this.org(principal) }, orderBy: { updatedAt: "desc" } }); }
  createAutomation(principal: AuthPrincipal, dto: AutomationDto) { return this.prisma.automation.create({ data: { organizationId: this.org(principal), name: dto.name, channel: dto.channel, triggerType: dto.triggerType, configuration: dto.configuration as Prisma.InputJsonValue, active: dto.active ?? true } }); }
  appointments(principal: AuthPrincipal) { return this.prisma.appointment.findMany({ where: { organizationId: this.org(principal) }, include: { contact: true }, orderBy: { scheduledAt: "asc" } }); }
  async createAppointment(principal: AuthPrincipal, dto: AppointmentDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, dto.contactId); if (dto.conversationId) await this.requireConversation(organizationId, dto.conversationId); return this.prisma.appointment.create({ data: { organizationId, contactId: dto.contactId, conversationId: dto.conversationId, scheduledAt: new Date(dto.scheduledAt), status: "SCHEDULED", meetingUrl: dto.meetingUrl } }); }
  reminders(principal: AuthPrincipal) { return this.prisma.reminder.findMany({ where: { organizationId: this.org(principal) }, orderBy: { scheduledAt: "asc" } }); }
  async createReminder(principal: AuthPrincipal, dto: ReminderDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, dto.contactId); if (dto.conversationId) await this.requireConversation(organizationId, dto.conversationId); return this.prisma.reminder.create({ data: { organizationId, contactId: dto.contactId, conversationId: dto.conversationId, scheduledAt: new Date(dto.scheduledAt), type: dto.type } }); }
  aiUsage(principal: AuthPrincipal, query: PageQueryDto) { return this.prisma.aIUsageRecord.findMany({ where: { organizationId: this.org(principal) }, ...this.paging(query), orderBy: { createdAt: "desc" } }); }
  async auditLogs(principal: AuthPrincipal, query: PageQueryDto) {
    const organizationId = this.org(principal);
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where: { organizationId }, ...this.paging(query), orderBy: { createdAt: "desc" } }), this.prisma.auditLog.count({ where: { organizationId } })]);
    const page = this.normalizedPage(query);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }
  activeSessions(principal: AuthPrincipal) {
    return (this.prisma as any).session.findMany({
      where: { userId: principal.userId, organizationId: principal.organizationId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    }).then((items: Array<{ id: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date }>) => items.map(item => ({ ...item, current: item.id === principal.sessionId, device: "Navegador web", location: "Ubicacion no registrada" })));
  }
  async revokeOtherSessions(principal: AuthPrincipal) {
    await (this.prisma as any).session.updateMany({ where: { userId: principal.userId, organizationId: principal.organizationId, id: { not: principal.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit(principal, "OTHER_SESSIONS_REVOKED", "Session", principal.sessionId);
    return { ok: true };
  }

  private async requireContact(organizationId: string, id: string) { const item = await this.prisma.contact.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!item) throw new NotFoundException("Contacto no encontrado"); return item; }
  private async requireConversation(organizationId: string, id: string) { const item = await this.prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!item) throw new NotFoundException("Conversación no encontrada"); return item; }
  private audit(principal: AuthPrincipal, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue) { return this.prisma.auditLog.create({ data: { organizationId: this.org(principal), userId: principal.userId, action, entityType, entityId, metadata } }); }
  private async requireConversationForAction(principal: AuthPrincipal, id: string) {
    const organizationId = this.org(principal);
    const item = await this.prisma.conversation.findFirst({ where: { id, organizationId, ...(principal.role === "AGENT" ? { OR: [{ assignedUserId: principal.userId }, { assignedUserId: null }] } : {}) }, select: { id: true } });
    if (!item) throw new NotFoundException("Conversacion no encontrada");
    return item;
  }
  private async changeConversationControl(principal: AuthPrincipal, id: string, data: Prisma.ConversationUncheckedUpdateInput, action: string, message: string) {
    const organizationId = this.org(principal);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const systemMessage = await tx.message.create({ data: { organizationId, conversationId: id, direction: "OUTBOUND", senderType: "SYSTEM", content: message, status: "SENT" } });
      await tx.conversation.update({ where: { id }, data: { ...data, lastMessageAt: systemMessage.createdAt } });
      await tx.auditLog.create({ data: { organizationId, userId: principal.userId, action, entityType: "Conversation", entityId: id, metadata: { message } } });
      return tx.conversation.findFirstOrThrow({ where: { id, organizationId }, include: { contact: { include: { tags: { include: { tag: true } }, notes: { orderBy: { createdAt: "desc" } } } }, messages: { orderBy: { createdAt: "asc" } }, appointments: true, reminders: true } });
    });
  }
  private async deliverOutboundMessage(conversation: any, content: string): Promise<{ sent: boolean; status: string; externalMessageId?: string }> {
    try {
      return await this.sendMetaMessage(conversation, content);
    } catch {
      return { sent: false, status: "delivery_exception" };
    }
  }

  private async sendMetaMessage(conversation: any, content: string): Promise<{ sent: boolean; status: string; externalMessageId?: string }> {
    const mode = (this.config?.get<string>("CHANNEL_PROVIDER_MODE") ?? "mock").toLowerCase();
    if (mode === "mock") return { sent: true, status: "mock_sent" };
    if (mode !== "meta") return { sent: false, status: "provider_disabled" };
    if (!["INSTAGRAM", "FACEBOOK", "WHATSAPP"].includes(conversation.channel)) return { sent: false, status: "unsupported_channel" };
    const recipientId = conversation.channel === "INSTAGRAM" ? conversation.contact?.instagramUsername : conversation.channel === "FACEBOOK" ? conversation.contact?.facebookId : conversation.contact?.whatsappId;
    if (!recipientId) return { sent: false, status: "missing_recipient" };
    const version = this.config?.get<string>("META_GRAPH_VERSION")?.trim() || "v20.0";
    const organizationId = String(conversation.organizationId ?? "");
    if (conversation.channel === "WHATSAPP") {
      const connection = await (this.prisma as any).metaConnection?.findUnique?.({ where: { organizationId_provider: { organizationId, provider: "WHATSAPP" } }, select: { status: true, accessTokenEncrypted: true, scopes: true } });
      const phoneNumberId = (connection?.scopes as any)?.phoneNumberId;
      if (!connection || connection.status !== "CONNECTED" || !connection.accessTokenEncrypted || !phoneNumberId) return { sent: false, status: "missing_whatsapp_connection" };
      return this.postWhatsAppMessage(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, this.decryptMetaToken(connection.accessTokenEncrypted), recipientId, content);
    }
    if (conversation.channel === "INSTAGRAM") {
      const connection = await (this.prisma as any).metaConnection?.findUnique?.({
        where: { organizationId_provider: { organizationId, provider: "INSTAGRAM" } },
        select: { status: true, accessTokenEncrypted: true },
      });
      if (!connection || connection.status !== "CONNECTED" || !connection.accessTokenEncrypted) return { sent: false, status: "missing_instagram_connection" };
      const token = this.decryptMetaToken(connection.accessTokenEncrypted);
      return this.postMetaMessage(`https://graph.instagram.com/${version}/me/messages?access_token=${encodeURIComponent(token)}`, recipientId, content);
    }
    const connection = await (this.prisma as any).metaConnection?.findUnique?.({
      where: { organizationId_provider: { organizationId, provider: "FACEBOOK" } },
      select: { status: true, externalAccountId: true, accessTokenEncrypted: true },
    });
    if (!connection || connection.status !== "CONNECTED" || !connection.accessTokenEncrypted || !connection.externalAccountId) return { sent: false, status: "missing_facebook_connection" };
    const token = this.decryptMetaToken(connection.accessTokenEncrypted);
    return this.postMetaMessage(`https://graph.facebook.com/${version}/${encodeURIComponent(connection.externalAccountId)}/messages?access_token=${encodeURIComponent(token)}`, recipientId, content);
  }

  private async postMetaMessage(url: string, recipientId: string, content: string): Promise<{ sent: boolean; status: string; externalMessageId?: string }> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text: content } }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, status: "meta_error" };
    return { sent: true, status: "sent", externalMessageId: typeof payload?.message_id === "string" ? payload.message_id : undefined };
  }

  private async postWhatsAppMessage(url: string, token: string, recipientId: string, content: string): Promise<{ sent: boolean; status: string; externalMessageId?: string }> {
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: recipientId, type: "text", text: { body: content } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, status: "whatsapp_error" };
    return { sent: true, status: "sent", externalMessageId: typeof payload?.messages?.[0]?.id === "string" ? payload.messages[0].id : undefined };
  }

  private decryptMetaToken(value: string) {
    const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":");
    if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) throw new BadRequestException("El token de Instagram guardado no es valido. Conecta la cuenta nuevamente.");
    try {
      const key = createHash("sha256").update(this.config?.getOrThrow<string>("APP_ENCRYPTION_KEY") ?? "").digest();
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"));
      decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(encryptedBase64, "base64")), decipher.final()]).toString("utf8");
    } catch {
      throw new BadRequestException("No fue posible leer el token de Instagram. Conecta la cuenta nuevamente.");
    }
  }
  private estimateAiCost(inputTokens: number, outputTokens: number) {
    const inputRate = Number(this.config?.get<number>("AI_INPUT_COST_PER_MILLION_USD") ?? 0);
    const outputRate = Number(this.config?.get<number>("AI_OUTPUT_COST_PER_MILLION_USD") ?? 0);
    return Number((((inputTokens / 1_000_000) * inputRate) + ((outputTokens / 1_000_000) * outputRate)).toFixed(6));
  }
  private async ensureSeatLimit(organizationId: string) {
    const subscriptionApi = (this.prisma as any).subscription;
    const membershipApi = (this.prisma as any).membership;
    if (!subscriptionApi?.findFirst || !membershipApi?.count) return;
    const subscription = await subscriptionApi.findFirst({ where: { organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "INCOMPLETE"] } }, orderBy: { createdAt: "desc" }, include: { planPrice: true } });
    if (!subscription?.planPrice?.seatsLimit) return;
    const used = await membershipApi.count({ where: { organizationId } });
    if (used >= subscription.planPrice.seatsLimit) throw new ForbiddenException("Alcanzaste el límite de usuarios de tu plan. Cambia de plan para agregar más.");
  }
}
