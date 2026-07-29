import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import type { AuthPrincipal } from "../../../packages/shared/src/index";
import { CurrentPrincipal, Protected } from "./security";
import { AISimulateDto, AppointmentDto, AutomationDto, CreateContactDto, CreateNoteDto, CreateTagDto, InviteMemberDto, PageQueryDto, PromptDto, ReminderDto, SendMessageDto, UpdateContactDto, UpdateMemberRoleDto } from "./resource.dto";
import { ResourceService } from "./resource.service";
import { ChannelProviderService } from "./channel-provider.service";

const ALL = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "SUPERVISOR", "AGENT"] as const;
const MANAGERS = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "SUPERVISOR"] as const;
const ADMINS = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"] as const;

@Controller()
export class ResourcesController {
  constructor(@Inject(ResourceService) private readonly resources: ResourceService, @Inject(ChannelProviderService) private readonly channels: ChannelProviderService) {}

  @Get("organization/current") @Protected(...ALL) organization(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.currentOrganization(principal); }
  @Get("dashboard") @Protected(...MANAGERS) dashboard(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.dashboard(principal); }
  @Get("team/members") @Protected(...ADMINS) teamMembers(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.teamMembers(principal); }
  @Post("team/members") @Protected(...ADMINS) inviteMember(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: InviteMemberDto) { return this.resources.inviteMember(principal, dto); }
  @Patch("team/members/:id") @Protected(...ADMINS) updateMemberRole(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMemberRoleDto) { return this.resources.updateMemberRole(principal, id, dto); }
  @Delete("team/members/:id") @Protected(...ADMINS) removeMember(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.resources.removeMember(principal, id); }
  @Get("channels") @Protected(...ALL) channelsStatus() { return this.channels.list(); }
  @Post("channels/:channel/connect") @Protected(...MANAGERS) connectChannel(@Param("channel") channel: "INSTAGRAM" | "WHATSAPP" | "FACEBOOK") { return this.channels.connect(channel); }
  @Post("channels/:channel/disconnect") @Protected(...MANAGERS) disconnectChannel(@Param("channel") channel: "INSTAGRAM" | "WHATSAPP" | "FACEBOOK") { return this.channels.disconnect(channel); }
  @Post("channels/:channel/test") @Protected(...ALL) testChannel(@Param("channel") channel: "INSTAGRAM" | "WHATSAPP" | "FACEBOOK") { return this.channels.test(channel); }

  @Get("contacts") @Protected(...ALL) contacts(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: PageQueryDto) { return this.resources.contacts(principal, query); }
  @Post("contacts") @Protected(...MANAGERS) createContact(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateContactDto) { return this.resources.createContact(principal, dto); }
  @Patch("contacts/:id") @Protected(...MANAGERS) updateContact(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) { return this.resources.updateContact(principal, id, dto); }
  @Delete("contacts/:id") @Protected(...ADMINS) deleteContact(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.resources.deleteContact(principal, id); }

  @Get("conversations") @Protected(...ALL) conversations(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: PageQueryDto) { return this.resources.conversations(principal, query); }
  @Get("conversations/:id") @Protected(...ALL) conversation(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.resources.conversation(principal, id); }
  @Post("conversations/:id/messages") @Protected(...ALL) sendMessage(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) { return this.resources.sendMessage(principal, id, dto); }
  @Post("conversations/:id/take") @Protected(...ALL) takeConversation(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.resources.takeConversation(principal, id); }
  @Post("conversations/:id/return-to-ai") @Protected(...ALL) returnConversationToAi(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.resources.returnConversationToAi(principal, id); }
  @Post("conversations/:id/close") @Protected(...ALL) closeConversation(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.resources.closeConversation(principal, id); }
  @Post("notes") @Protected(...ALL) createNote(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateNoteDto) { return this.resources.createNote(principal, dto); }

  @Get("tags") @Protected(...ALL) tags(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.tags(principal); }
  @Post("tags") @Protected(...MANAGERS) createTag(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateTagDto) { return this.resources.createTag(principal, dto); }
  @Post("contacts/:contactId/tags/:tagId") @Protected(...ALL) attachTag(@CurrentPrincipal() principal: AuthPrincipal, @Param("contactId", ParseUUIDPipe) contactId: string, @Param("tagId", ParseUUIDPipe) tagId: string) { return this.resources.attachTag(principal, contactId, tagId); }

  @Get("prompts/current") @Protected(...ADMINS) prompt(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.prompt(principal); }
  @Post("prompts") @Protected(...ADMINS) savePrompt(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: PromptDto) { return this.resources.savePrompt(principal, dto); }
  @Post("ai/simulate") @Protected(...ADMINS) simulateAi(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: AISimulateDto) { return this.resources.simulateAi(principal, dto); }
  @Get("automations") @Protected(...ADMINS) automations(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.automations(principal); }
  @Post("automations") @Protected(...ADMINS) createAutomation(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: AutomationDto) { return this.resources.createAutomation(principal, dto); }

  @Get("appointments") @Protected(...ALL) appointments(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.appointments(principal); }
  @Post("appointments") @Protected(...ALL) createAppointment(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: AppointmentDto) { return this.resources.createAppointment(principal, dto); }
  @Get("reminders") @Protected(...ALL) reminders(@CurrentPrincipal() principal: AuthPrincipal) { return this.resources.reminders(principal); }
  @Post("reminders") @Protected(...ALL) createReminder(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: ReminderDto) { return this.resources.createReminder(principal, dto); }

  @Get("ai-usage") @Protected(...ADMINS) aiUsage(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: PageQueryDto) { return this.resources.aiUsage(principal, query); }
  @Get("audit") @Protected(...ADMINS) audit(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: PageQueryDto) { return this.resources.auditLogs(principal, query); }
}
