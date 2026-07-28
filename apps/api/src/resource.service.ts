import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { PrismaService } from "./prisma.service";
import type { AppointmentDto, AutomationDto, CreateContactDto, CreateNoteDto, CreateTagDto, PageQueryDto, PromptDto, ReminderDto, SendMessageDto, UpdateContactDto } from "./resource.dto";

export function safePercentage(part: number, total: number) { return total > 0 ? Number(((Math.max(0, part) / total) * 100).toFixed(1)) : 0; }

@Injectable()
export class ResourceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private org(principal: AuthPrincipal) { if (!principal.organizationId) throw new ForbiddenException("Organización requerida"); return principal.organizationId; }
  private paging(query: PageQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }

  currentOrganization(principal: AuthPrincipal) { return this.prisma.organization.findUniqueOrThrow({ where: { id: this.org(principal) }, select: { id: true, name: true, slug: true, status: true, mode: true, plan: true } }); }

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

  async createNote(principal: AuthPrincipal, dto: CreateNoteDto) { const organizationId = this.org(principal); await this.requireContact(organizationId, dto.contactId); const note = await this.prisma.note.create({ data: { organizationId, contactId: dto.contactId, userId: principal.userId, content: dto.content } }); await this.audit(principal, "NOTE_CREATED", "Note", note.id); return note; }
  tags(principal: AuthPrincipal) { return this.prisma.tag.findMany({ where: { organizationId: this.org(principal) }, orderBy: { name: "asc" } }); }
  createTag(principal: AuthPrincipal, dto: CreateTagDto) { return this.prisma.tag.create({ data: { ...dto, organizationId: this.org(principal) } }); }
  async attachTag(principal: AuthPrincipal, contactId: string, tagId: string) { const organizationId = this.org(principal); await this.requireContact(organizationId, contactId); const tag = await this.prisma.tag.findFirst({ where: { id: tagId, organizationId } }); if (!tag) throw new NotFoundException("Etiqueta no encontrada"); return this.prisma.contactTag.upsert({ where: { organizationId_contactId_tagId: { organizationId, contactId, tagId } }, update: {}, create: { organizationId, contactId, tagId } }); }

  prompt(principal: AuthPrincipal) { return this.prisma.prompt.findFirst({ where: { organizationId: this.org(principal), active: true }, include: { publishedVersion: true, versions: { orderBy: { versionNumber: "desc" } } } }); }
  async savePrompt(principal: AuthPrincipal, dto: PromptDto) { const organizationId = this.org(principal); const existing = await this.prisma.prompt.findFirst({ where: { organizationId, active: true }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }); return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => { const prompt = existing ?? await tx.prompt.create({ data: { organizationId, agentName: dto.agentName } }); const version = await tx.promptVersion.create({ data: { organizationId, promptId: prompt.id, versionNumber: (existing?.versions[0]?.versionNumber ?? 0) + 1, content: dto.content, status: dto.publish ? "PUBLISHED" : "DRAFT", createdBy: principal.userId, publishedAt: dto.publish ? new Date() : null } }); if (dto.publish) await tx.prompt.update({ where: { id: prompt.id }, data: { agentName: dto.agentName, publishedVersionId: version.id } }); await tx.auditLog.create({ data: { organizationId, userId: principal.userId, action: dto.publish ? "PROMPT_PUBLISHED" : "PROMPT_SAVED", entityType: "PromptVersion", entityId: version.id } }); return version; }); }

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
  private async ensureContactLimit(organizationId: string) {
    const subscriptionApi = (this.prisma as any).subscription;
    if (!subscriptionApi?.findFirst) return;
    const subscription = await subscriptionApi.findFirst({ where: { organizationId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "INCOMPLETE"] } }, orderBy: { createdAt: "desc" }, include: { planPrice: true } });
    if (!subscription?.planPrice?.monthlyContactsLimit) return;
    const used = await this.prisma.contact.count({ where: { organizationId } });
    if (used >= subscription.planPrice.monthlyContactsLimit) throw new ForbiddenException("Alcanzaste el limite de contactos de tu plan. Cambia de plan para agregar mas.");
  }
}
