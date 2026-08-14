import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDecipheriv, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { PrismaService } from "../prisma.service";
import { ResourceService } from "../resource.service";

type MetaMessageEvent = {
  object: string;
  senderId?: string;
  recipientId?: string;
  messageId?: string;
  text?: string;
  timestamp?: Date;
  channel?: "INSTAGRAM" | "FACEBOOK";
  raw: unknown;
};

type GraphCollection<T> = { data?: T[] };
type GraphConversation = { id: string; updated_time?: string };
type GraphMessage = {
  id?: string;
  created_time?: string;
  message?: string;
  from?: { id?: string; username?: string; name?: string };
  to?: { data?: { id?: string; username?: string; name?: string }[] };
};

@Injectable()
export class MetaWebhookService {
  private readonly logger = new Logger(MetaWebhookService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService, @Optional() @Inject(ResourceService) private readonly resources?: ResourceService) {}

  verify(mode?: string, token?: string, challenge?: string) {
    const expected = this.config.get<string>("META_VERIFY_TOKEN")?.trim();
    if (mode === "subscribe" && expected && token === expected) return challenge ?? "";
    throw new ForbiddenException("Verificación Meta inválida");
  }

  async receive(payload: unknown, rawBody: Buffer | string, signature?: string) {
    this.validateSignature(rawBody, signature);
    const events = this.extractEvents(payload);
    this.logger.log(`Meta webhook recibido: object=${String((payload as any)?.object ?? "unknown")} events=${events.length}`);
    for (const event of events) await this.processEvent(event);
    return { received: true };
  }

  async debug() {
    const organizationId = await this.resolveOrganizationId().catch(() => null);
    const recentEvents = await (this.prisma as any).metaWebhookEvent.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        object: true,
        channel: true,
        senderId: true,
        recipientId: true,
        messageId: true,
        processedAt: true,
        ignoredReason: true,
        createdAt: true,
      },
    });
    const connection = organizationId
      ? await (this.prisma as any).metaConnection.findUnique({
          where: { organizationId_provider: { organizationId, provider: "INSTAGRAM" } },
          select: { status: true, externalAccountId: true, username: true, connectedAt: true, expiresAt: true, lastError: true },
        })
      : null;

    const pageToken = this.config.get<string>("META_PAGE_ACCESS_TOKEN")?.trim() ?? "";
    return {
      providerMode: this.config.get<string>("CHANNEL_PROVIDER_MODE") ?? "mock",
      organizationId,
      configured: {
        appId: Boolean(this.config.get<string>("META_APP_ID")?.trim()),
        instagramAppId: Boolean(this.config.get<string>("META_INSTAGRAM_APP_ID")?.trim()),
        appSecret: Boolean(this.config.get<string>("META_APP_SECRET")?.trim()),
        pageId: this.config.get<string>("META_PAGE_ID")?.trim() || null,
        igBusinessAccountId: this.config.get<string>("META_IG_BUSINESS_ACCOUNT_ID")?.trim() || null,
        verifyToken: Boolean(this.config.get<string>("META_VERIFY_TOKEN")?.trim()),
        graphVersion: this.config.get<string>("META_GRAPH_VERSION")?.trim() || null,
        pageAccessToken: pageToken ? { present: true, prefix: pageToken.slice(0, 4), length: pageToken.length } : { present: false, prefix: "", length: 0 },
      },
      connection,
      recentEvents,
    };
  }

  async syncInstagramInbox(principal: AuthPrincipal) {
    const organizationId = principal.organizationId;
    if (!organizationId) throw new ForbiddenException("Organizacion requerida para sincronizar Instagram");
    const connection = await (this.prisma as any).metaConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider: "INSTAGRAM" } },
      select: { status: true, externalAccountId: true, accessTokenEncrypted: true },
    });
    if (!connection || connection.status !== "CONNECTED" || !connection.accessTokenEncrypted || !connection.externalAccountId) {
      throw new BadRequestException("Conecta Instagram para esta organizacion antes de sincronizar.");
    }
    const token = this.decrypt(connection.accessTokenEncrypted);
    const igBusinessAccountId = connection.externalAccountId;
    const version = this.config.get<string>("META_GRAPH_VERSION")?.trim() || "v23.0";

    const conversations = await this.graphGet<GraphCollection<GraphConversation>>(
      `${igBusinessAccountId}/conversations?fields=id,updated_time&limit=25`,
      token,
      version,
    );

    let checked = 0;
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const conversation of conversations.data ?? []) {
      if (!conversation.id) continue;
      checked += 1;
      try {
        const messages = await this.graphGet<GraphCollection<GraphMessage>>(
          `${conversation.id}/messages?fields=id,created_time,message,from,to&limit=25`,
          token,
          version,
        );
        for (const message of messages.data ?? []) {
          const messageId = message.id?.trim();
          const text = message.message?.trim();
          const senderId = message.from?.id?.trim();
          if (!messageId || !text || !senderId) {
            skipped += 1;
            continue;
          }
          const existing = await (this.prisma as any).metaWebhookEvent.findUnique({ where: { messageId } });
          if (existing) {
            skipped += 1;
            continue;
          }
          const recipientId = message.to?.data?.find((item) => item.id && item.id !== senderId)?.id ?? igBusinessAccountId;
          await this.processEvent({
            object: "instagram",
            senderId,
            recipientId,
            messageId,
            text,
            timestamp: message.created_time ? new Date(message.created_time) : undefined,
            channel: "INSTAGRAM",
            raw: { source: "graph_sync", conversationId: conversation.id, message },
          });
          created += 1;
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "No se pudo sincronizar una conversacion");
      }
    }

    return { synced: true, checked, created, skipped, errors };
  }

  validateSignature(rawBody: Buffer | string, signature?: string) {
    if (!signature) return;
    const appSecret = this.config.get<string>("META_APP_SECRET")?.trim();
    if (!appSecret) throw new ForbiddenException("Firma Meta no verificable");
    const provided = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;
    const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const providedBuffer = Buffer.from(provided, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) throw new ForbiddenException("Firma Meta inválida");
  }

  extractEvents(payload: any): MetaMessageEvent[] {
    if (!payload || !["instagram", "page"].includes(String(payload.object))) return [];
    const channel = payload.object === "instagram" ? "INSTAGRAM" : "FACEBOOK";
    const events: MetaMessageEvent[] = [];
    for (const entry of payload.entry ?? []) {
      const messaging = entry.messaging ?? [];
      for (const item of messaging) {
        const message = item.message;
        const messageEdit = item.message_edit;
        events.push({
          object: String(payload.object),
          senderId: item.sender?.id ? String(item.sender.id) : undefined,
          recipientId: item.recipient?.id ? String(item.recipient.id) : undefined,
          messageId: message?.mid ? String(message.mid) : messageEdit?.mid ? `edit:${String(messageEdit.mid)}` : undefined,
          text: typeof message?.text === "string" ? message.text : undefined,
          timestamp: this.metaTimestamp(item.timestamp),
          channel,
          raw: { object: payload.object, entry },
        });
      }
      const changes = entry.changes ?? [];
      for (const change of changes) {
        if (change?.field !== "messages") continue;
        const value = change.value ?? {};
        const message = value.message;
        events.push({
          object: String(payload.object),
          senderId: value.sender?.id ? String(value.sender.id) : undefined,
          recipientId: value.recipient?.id ? String(value.recipient.id) : undefined,
          messageId: message?.mid ? String(message.mid) : undefined,
          text: typeof message?.text === "string" ? message.text : undefined,
          timestamp: this.metaTimestamp(value.timestamp),
          channel,
          raw: { object: payload.object, entry: { id: entry.id, time: entry.time, changes: [change] } },
        });
      }
    }
    return events;
  }

  private metaTimestamp(value: unknown) {
    const numeric = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
    if (!numeric) return undefined;
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  }

  private async processEvent(event: MetaMessageEvent) {
    const organizationId = await this.resolveOrganizationId(event.recipientId);
    if (!organizationId) {
      this.logger.warn(`Evento Meta ignorado: la cuenta receptora ${event.recipientId ?? "desconocida"} no pertenece a una organizacion conectada.`);
      return;
    }
    const ignoredReason = this.ignoredReason(event);
    const rawPayload = event.raw as Prisma.InputJsonValue;

    if (event.messageId) {
      const existing = await (this.prisma as any).metaWebhookEvent.findUnique({ where: { messageId: event.messageId } });
      if (existing) return;
    }

    await (this.prisma as any).metaWebhookEvent.create({
      data: {
        organizationId,
        object: event.object,
        senderId: event.senderId,
        recipientId: event.recipientId,
        messageId: event.messageId,
        channel: event.channel,
        timestamp: event.timestamp,
        rawPayload,
        processedAt: ignoredReason ? null : new Date(),
        ignoredReason,
      },
    });

    if (ignoredReason || !event.senderId || !event.channel) return;
    const text = event.text?.trim();
    if (!text) return;

    const result = await this.prisma.$transaction(async (tx) => {
      const contact = await this.upsertContact(tx, organizationId, event);
      const conversation = await this.openConversation(tx, organizationId, contact.id, event.channel!);
      await tx.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          direction: "INBOUND",
          senderType: "CONTACT",
          content: text,
          externalMessageId: event.messageId,
          status: "DELIVERED",
          createdAt: event.timestamp ?? new Date(),
        },
      });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: event.timestamp ?? new Date(), status: "OPEN" } });
      return { conversationId: conversation.id, text };
    });

    if (this.autoReplyEnabled()) {
      void this.resources?.autoReplyFromInbound(organizationId, result.conversationId, result.text).catch(() => undefined);
    }
  }

  private async graphGet<T>(path: string, token: string, version: string): Promise<T> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `https://graph.instagram.com/${version}/${path}${separator}access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.error?.message === "string" ? body.error.message : "Meta Graph rechazo la solicitud";
      throw new BadRequestException(message);
    }
    return body as T;
  }

  private decrypt(value: string) {
    const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":");
    if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) throw new BadRequestException("El token de Instagram guardado no es valido. Conecta la cuenta nuevamente.");
    try {
      const key = createHash("sha256").update(this.config.getOrThrow<string>("APP_ENCRYPTION_KEY")).digest();
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"));
      decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(encryptedBase64, "base64")), decipher.final()]).toString("utf8");
    } catch {
      throw new BadRequestException("No fue posible leer el token de Instagram. Conecta la cuenta nuevamente.");
    }
  }

  private autoReplyEnabled() {
    return this.config.get<boolean>("AI_AUTO_REPLY_ENABLED") !== false;
  }

  private ignoredReason(event: MetaMessageEvent) {
    if (!event.messageId) return "missing_message_id";
    if (!event.senderId) return "missing_sender_id";
    const ownIds = [this.config.get<string>("META_PAGE_ID"), this.config.get<string>("META_IG_BUSINESS_ACCOUNT_ID")].filter(Boolean);
    if (ownIds.includes(event.senderId)) return "own_page_message";
    if (!event.text?.trim()) return "unsupported_non_text_message";
    return undefined;
  }

  private async resolveOrganizationId(externalAccountId?: string) {
    if (externalAccountId) {
      const connection = await (this.prisma as any).metaConnection.findFirst({
        where: { externalAccountId, provider: "INSTAGRAM", status: "CONNECTED", organization: { status: "ACTIVE" } },
        select: { organizationId: true },
      });
      if (connection?.organizationId) return connection.organizationId;
    }
    return null;
    /* Legacy single-tenant fallback intentionally disabled. Connections must map by recipient account. 
    const configuredOrganizationId = this.config.get<string>("META_ORGANIZATION_ID")?.trim();
    if (configuredOrganizationId) {
      const legacyOrganization = await this.prisma.organization.findFirst({ where: { id: configuredOrganizationId, status: "ACTIVE" }, select: { id: true } });
      if (legacyOrganization) return legacyOrganization.id;
      throw new ForbiddenException("META_ORGANIZATION_ID no corresponde a una organización activa");
    }
    const fallbackOrganization = await this.prisma.organization.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const organization = fallbackOrganization;
    if (!organization) throw new ForbiddenException("Organización activa requerida para recibir Meta");
    return organization.id; */
  }

  private async upsertContact(tx: Prisma.TransactionClient, organizationId: string, event: MetaMessageEvent) {
    const where = event.channel === "INSTAGRAM"
      ? { organizationId, instagramUsername: event.senderId }
      : { organizationId, facebookId: event.senderId };
    const existing = await tx.contact.findFirst({ where });
    if (existing) return tx.contact.update({ where: { id: existing.id }, data: { lastInteractionAt: event.timestamp ?? new Date() } });
    return tx.contact.create({
      data: {
        organizationId,
        firstName: event.channel === "INSTAGRAM" ? `Instagram ${this.readableSender(event.senderId)}` : `Facebook ${this.readableSender(event.senderId)}`,
        instagramUsername: event.channel === "INSTAGRAM" ? event.senderId : undefined,
        facebookId: event.channel === "FACEBOOK" ? event.senderId : undefined,
        lastInteractionAt: event.timestamp ?? new Date(),
      },
    });
  }

  private async openConversation(tx: Prisma.TransactionClient, organizationId: string, contactId: string, channel: "INSTAGRAM" | "FACEBOOK") {
    const existing = await tx.conversation.findFirst({ where: { organizationId, contactId, channel, status: "OPEN" }, orderBy: { lastMessageAt: "desc" } });
    if (existing) return existing;
    return tx.conversation.create({ data: { organizationId, contactId, channel, status: "OPEN", aiStatus: "ACTIVE", lastMessageAt: new Date() } });
  }

  private readableSender(senderId?: string) {
    const clean = (senderId ?? "cliente").replace(/^ig[-_]?/i, "").replace(/^fb[-_]?/i, "");
    return clean.length > 12 ? clean.slice(-8) : clean;
  }
}
