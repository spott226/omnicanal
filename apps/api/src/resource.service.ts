import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { AIProviderService } from "./ai-provider.service";
import { PrismaService } from "./prisma.service";
import type { AISimulateDto, AppointmentDto, AutomationDto, CreateContactDto, CreateNoteDto, CreateTagDto, InviteMemberDto, PageQueryDto, PromptDto, ReminderDto, SendMessageDto, UpdateContactDto, UpdateMemberRoleDto } from "./resource.dto";

export function safePercentage(part: number, total: number) { return total > 0 ? Number(((Math.max(0, part) / total) * 100).toFixed(1)) : 0; }

@Injectable()
export class ResourceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AIProviderService) private readonly aiProvider?: AIProviderService) {}
  private org(principal: AuthPrincipal) { if (!principal.organizationId) throw new ForbiddenException("Organización requerida"); return principal.organizationId; }
  private paging(query: PageQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }

  currentOrganization(principal: AuthPrincipal) { return this.prisma.organization.findUniqueOrThrow({ where: { id: this.org(principal) }, select: { id: true, name: true, slug: true, status: true, mode: true, plan: true } }); }

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

  async contacts(principal: AuthPrincipal, query: PageQueryDto) {
    const organizationId = this.org(principal); const where = { organizationId, ...(query.search ? { OR: [{ firstName: { contains: query.search, mode: "insensitive" as const } }, { lastName: { contains: query.search, mode: "insensitive" as const } }, { email: { contains: query.search, mode: "insensitive" as const } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.contact.findMany({ where, ...this.paging(query), orderBy: { lastInteractionAt: query.sort === "asc" ? "asc" : "desc" }, include: { tags: { include: { tag: true } } } }), this.prisma.contact.count({ where })]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async createContact(principal: AuthPrincipal, dto: CreateContactDto) { const organizationId = this.org(principal); await this.ensureContactLimit(organizationId); return this.prisma.contact.create({ data: { ...dto, organizationId } }); }
  async updateContact(principal: AuthPrincipal, id: string, dto: UpdateContactDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, id); return this.prisma.contact.update({ where: { id }, data: dto }); }
  async deleteContact(principal: AuthPrincipal, id: string) { const organizationId = this.org(principal); await this.requireContact(organizationId, id); await this.prisma.contact.delete({ where: { id } }); return { ok: true }; }

  async conversations(principal: AuthPrincipal, query: PageQueryDto) {
    const organizationId = this.org(principal); const where = { organizationId, ...(principal.role === "AGENT" ? { assignedUserId: principal.userId } : {}), ...(query.search ? { contact: { OR: [{ firstName: { contains: query.search, mode: "insensitive" as const } }, { lastName: { contains: query.search, mode: "insensitive" as const } }] } } : {}) };
    const [items, total] = await Promise.all([this.prisma.conversation.findMany({ where, ...this.paging(query), orderBy: { lastMessageAt: query.sort === "asc" ? "asc" : "desc" }, include: { contact: true, messages: { take: 1, orderBy: { createdAt: "desc" } } } }), this.prisma.conversation.count({ where })]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async conversation(principal: AuthPrincipal, id: string) { const item = await this.prisma.conversation.findFirst({ where: { id, organizationId: this.org(principal), ...(principal.role === "AGENT" ? { assignedUserId: principal.userId } : {}) }, include: { contact: { include: { tags: { include: { tag: true } }, notes: { orderBy: { createdAt: "desc" } } } }, messages: { orderBy: { createdAt: "asc" } }, appointments: true, reminders: true } }); if (!item) throw new NotFoundException("Conversación no encontrada"); return item; }
  async sendMessage(principal: AuthPrincipal, id: string, dto: SendMessageDto) { const conversation = await this.conversation(principal, id); return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => { const message = await tx.message.create({ data: { organizationId: this.org(principal), conversationId: conversation.id, direction: "OUTBOUND", senderType: "USER", content: dto.content, status: "SENT" } }); await tx.conversation.update({ where: { id }, data: { lastMessageAt: message.createdAt } }); return message; }); }

  async takeConversation(principal: AuthPrincipal, id: string) { await this.requireConversationForAction(principal, id); return this.changeConversationControl(principal, id, { aiStatus: "TRANSFERRED", assignedUserId: principal.userId, status: "OPEN" }, "CONVERSATION_TAKEN", `${principal.name} tomo la conversacion. La IA quedo pausada.`); }
  async returnConversationToAi(principal: AuthPrincipal, id: string) { await this.requireConversationForAction(principal, id); return this.changeConversationControl(principal, id, { aiStatus: "ACTIVE", assignedUserId: null, status: "OPEN" }, "CONVERSATION_RETURNED_TO_AI", `${principal.name} devolvio la conversacion a la IA.`); }
  async closeConversation(principal: AuthPrincipal, id: string) { await this.requireConversationForAction(principal, id); return this.changeConversationControl(principal, id, { aiStatus: "PAUSED", status: "CLOSED" }, "CONVERSATION_CLOSED", `${principal.name} cerro la conversacion.`); }

  async createNote(principal: AuthPrincipal, dto: CreateNoteDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, dto.contactId); const note = await this.prisma.note.create({ data: { organizationId, contactId: dto.contactId, userId: principal.userId, content: dto.content } }); await this.audit(principal, "NOTE_CREATED", "Note", note.id); return note; }
  tags(principal: AuthPrincipal) { return this.prisma.tag.findMany({ where: { organizationId: this.org(principal) }, orderBy: { name: "asc" } }); }
  createTag(principal: AuthPrincipal, dto: CreateTagDto) { return this.prisma.tag.create({ data: { ...dto, organizationId: this.org(principal) } }); }
  async attachTag(principal: AuthPrincipal, contactId: string, tagId: string) { const organizationId = this.org(principal); await this.requireContact(organizationId, contactId); const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } }); if (!tag) throw new NotFoundException("Etiqueta no encontrada"); return this.prisma.contactTag.upsert({ where: { organizationId_contactId_tagId: { organizationId, contactId, tagId } }, update: {}, create: { organizationId, contactId, tagId } }); }

  prompt(principal: AuthPrincipal) { return this.prisma.prompt.findFirst({ where: { organizationId: this.org(principal), active: true }, include: { publishedVersion: true, versions: { orderBy: { versionNumber: "desc" } } } }); }
  async savePrompt(principal: AuthPrincipal, dto: PromptDto) { const organizationId = this.org(principal); const existing = await this.prisma.prompt.findFirst({ where: { organizationId, active: true }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }); return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => { const prompt = existing ?? await tx.prompt.create({ data: { organizationId, agentName: dto.agentName } }); const version = await tx.promptVersion.create({ data: { organizationId, promptId: prompt.id, versionNumber: (existing?.versions[0]?.versionNumber ?? 0) + 1, content: dto.content, status: dto.publish ? "PUBLISHED" : "DRAFT", createdBy: principal.userId, publishedAt: dto.publish ? new Date() : null } }); if (dto.publish) await tx.prompt.update({ where: { id: prompt.id }, data: { agentName: dto.agentName, publishedVersionId: version.id } }); await tx.auditLog.create({ data: { organizationId, userId: principal.userId, action: dto.publish ? "PROMPT_PUBLISHED" : "PROMPT_SAVED", entityType: "PromptVersion", entityId: version.id } }); return version; }); }
  async simulateAi(principal: AuthPrincipal, dto: AISimulateDto) {
    const organizationId = this.org(principal);
    const [organization, prompt] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
      this.prisma.prompt.findFirst({ where: { organizationId, active: true }, include: { publishedVersion: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }),
    ]);
    const provider = this.aiProvider ?? new AIProviderService({ get: () => "mock" } as any);
    return provider.simulate({ agentName: prompt?.agentName ?? "Nia", businessName: organization.name, prompt: prompt?.publishedVersion?.content ?? prompt?.versions?.[0]?.content ?? "", message: dto.message, turn: dto.turn ?? 0 });
  }

  automations(principal: AuthPrincipal) { return this.prisma.automation.findMany({ where: { organizationId: this.org(principal) }, orderBy: { updatedAt: "desc" } }); }
  createAutomation(principal: AuthPrincipal, dto: AutomationDto) { return this.prisma.automation.create({ data: { organizationId: this.org(principal), name: dto.name, channel: dto.channel, triggerType: dto.triggerType, configuration: dto.configuration as Prisma.InputJsonValue, active: dto.active ?? true } }); }
  appointments(principal: AuthPrincipal) { return this.prisma.appointment.findMany({ where: { organizationId: this.org(principal) }, include: { contact: true }, orderBy: { scheduledAt: "asc" } }); }
  async createAppointment(principal: AuthPrincipal, dto: AppointmentDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, dto.contactId); if (dto.conversationId) await this.requireConversation(organizationId, dto.conversationId); return this.prisma.appointment.create({ data: { organizationId, contactId: dto.contactId, conversationId: dto.conversationId, scheduledAt: new Date(dto.scheduledAt), status: "SCHEDULED", meetingUrl: dto.meetingUrl } }); }
  reminders(principal: AuthPrincipal) { return this.prisma.reminder.findMany({ where: { organizationId: this.org(principal) }, orderBy: { scheduledAt: "asc" } }); }
  async createReminder(principal: AuthPrincipal, dto: ReminderDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, dto.contactId); if (dto.conversationId) await this.requireConversation(organizationId, dto.conversationId); return this.prisma.reminder.create({ data: { organizationId, contactId: dto.contactId, conversationId: dto.conversationId, scheduledAt: new Date(dto.scheduledAt), type: dto.type } }); }
  aiUsage(principal: AuthPrincipal, query: PageQueryDto) { return this.prisma.aIUsageRecord.findMany({ where: { organizationId: this.org(principal) }, ...this.paging(query), orderBy: { createdAt: "desc" } }); }
  auditLogs(principal: AuthPrincipal, query: PageQueryDto) { return this.prisma.auditLog.findMany({ where: { organizationId: this.org(principal) }, ...this.paging(query), orderBy: { createdAt: "desc" } }); }

  private async requireContact(organizationId: string, id: string) { const item = await this.prisma.contact.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!item) throw new NotFoundException("Contacto no encontrado"); return item; }
  private async requireConversation(organizationId: string, id: string) { const item = await this.prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!item) throw new NotFoundException("Conversación no encontrada"); return item; }
  private audit(principal: AuthPrincipal, action: string, entityType: string, entityId: string) { return this.prisma.auditLog.create({ data: { organizationId: this.org(principal), userId: principal.userId, action, entityType, entityId } }); }
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
  private async ensureContactLimit(organizationId: string) {
    const subscriptionApi = (this.prisma as any).subscription;
    if (!subscriptionApi?.findFirst) return;
    const subscription = await subscriptionApi.findFirst({ where: { organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "INCOMPLETE"] } }, orderBy: { createdAt: "desc" }, include: { planPrice: true } });
    if (!subscription?.planPrice?.monthlyContactsLimit) return;
    const used = await this.prisma.contact.count({ where: { organizationId } });
    if (used >= subscription.planPrice.monthlyContactsLimit) throw new ForbiddenException("Alcanzaste el limite de contactos de tu plan. Cambia de plan para agregar mas.");
  }
  private async ensureSeatLimit(organizationId: string) {
    const subscriptionApi = (this.prisma as any).subscription;
    const membershipApi = (this.prisma as any).membership;
    if (!subscriptionApi?.findFirst || !membershipApi?.count) return;
    const subscription = await subscriptionApi.findFirst({ where: { organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "INCOMPLETE"] } }, orderBy: { createdAt: "desc" }, include: { planPrice: true } });
    if (!subscription?.planPrice?.seatsLimit) return;
    const used = await membershipApi.count({ where: { organizationId } });
    if (used >= subscription.planPrice.seatsLimit) throw new ForbiddenException("Alcanzaste el limite de usuarios de tu plan. Cambia de plan para agregar mas.");
  }
}
