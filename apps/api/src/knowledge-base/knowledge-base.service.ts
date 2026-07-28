import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { PrismaService } from "../prisma.service";
import type {
  CreateFaqDto,
  CreatePolicyDto,
  CreateProductDto,
  CreatePromotionDto,
  CreateScheduleDto,
  CreateServiceDto,
  KnowledgePageQueryDto,
  ScheduleEntryDto,
  UpdateFaqDto,
  UpdatePolicyDto,
  UpdateProductDto,
  UpdatePromotionDto,
  UpdateScheduleDto,
  UpdateServiceDto,
} from "./knowledge-base.dto";

type KnowledgeCategoryType = "FAQ" | "PRODUCT" | "SERVICE" | "POLICY";

@Injectable()
export class KnowledgeBaseService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private organizationId(principal: AuthPrincipal) {
    if (!principal.organizationId) throw new ForbiddenException("Organización requerida");
    return principal.organizationId;
  }

  private paging(query: KnowledgePageQueryDto) {
    return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
  }

  private page<T>(items: T[], total: number, query: KnowledgePageQueryDto) {
    return { items, total, page: query.page, pageSize: query.pageSize, pages: Math.ceil(total / query.pageSize) };
  }

  private async audit(db: Prisma.TransactionClient, principal: AuthPrincipal, action: string, entityType: string, entityId: string) {
    await db.auditLog.create({ data: { organizationId: this.organizationId(principal), userId: principal.userId, action, entityType, entityId } });
  }

  private async category(organizationId: string, id: string | undefined, type: KnowledgeCategoryType) {
    if (!id) return;
    const category = await this.prisma.knowledgeCategory.findFirst({ where: { id, organizationId, type, deletedAt: null }, select: { id: true } });
    if (!category) throw new BadRequestException("La categoría no existe o no corresponde al tipo de recurso");
  }

  private async unique<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Ya existe un registro con esa clave");
      throw error;
    }
  }

  async listFaqs(principal: AuthPrincipal, query: KnowledgePageQueryDto) {
    const organizationId = this.organizationId(principal);
    const where: Prisma.FaqWhereInput = { organizationId, deletedAt: null, ...(query.active === undefined ? {} : { active: query.active }), ...(query.search ? { OR: [{ question: { contains: query.search, mode: "insensitive" } }, { answer: { contains: query.search, mode: "insensitive" } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.faq.findMany({ where, ...this.paging(query), include: { category: { select: { id: true, name: true, slug: true } } }, orderBy: [{ sortOrder: "asc" }, { updatedAt: query.sort }] }),
      this.prisma.faq.count({ where }),
    ]);
    return this.page(items, total, query);
  }

  async getFaq(principal: AuthPrincipal, id: string) {
    const item = await this.prisma.faq.findFirst({ where: { id, organizationId: this.organizationId(principal), deletedAt: null }, include: { category: true } });
    if (!item) throw new NotFoundException("FAQ no encontrada");
    return item;
  }

  async createFaq(principal: AuthPrincipal, dto: CreateFaqDto) {
    const organizationId = this.organizationId(principal);
    await this.category(organizationId, dto.categoryId, "FAQ");
    return this.prisma.$transaction(async (db) => {
      const item = await db.faq.create({ data: { ...dto, organizationId } });
      await this.audit(db, principal, "KNOWLEDGE_FAQ_CREATED", "Faq", item.id);
      return item;
    });
  }

  async updateFaq(principal: AuthPrincipal, id: string, dto: UpdateFaqDto) {
    const organizationId = this.organizationId(principal);
    await this.getFaq(principal, id);
    await this.category(organizationId, dto.categoryId, "FAQ");
    return this.prisma.$transaction(async (db) => {
      const item = await db.faq.update({ where: { id }, data: dto });
      await this.audit(db, principal, "KNOWLEDGE_FAQ_UPDATED", "Faq", id);
      return item;
    });
  }

  async deleteFaq(principal: AuthPrincipal, id: string) {
    await this.getFaq(principal, id);
    return this.softDelete(principal, "Faq", id, (db) => db.faq.update({ where: { id }, data: { deletedAt: new Date(), active: false } }));
  }

  async listProducts(principal: AuthPrincipal, query: KnowledgePageQueryDto) {
    const organizationId = this.organizationId(principal);
    const where: Prisma.ProductWhereInput = { organizationId, deletedAt: null, ...(query.active === undefined ? {} : { active: query.active }), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { sku: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, ...this.paging(query), include: { category: { select: { id: true, name: true, slug: true } } }, orderBy: { updatedAt: query.sort } }),
      this.prisma.product.count({ where }),
    ]);
    return this.page(items, total, query);
  }

  async getProduct(principal: AuthPrincipal, id: string) {
    const item = await this.prisma.product.findFirst({ where: { id, organizationId: this.organizationId(principal), deletedAt: null }, include: { category: true } });
    if (!item) throw new NotFoundException("Producto no encontrado");
    return item;
  }

  async createProduct(principal: AuthPrincipal, dto: CreateProductDto) {
    const organizationId = this.organizationId(principal);
    await this.category(organizationId, dto.categoryId, "PRODUCT");
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.product.create({ data: { ...dto, sku: dto.sku.trim().toUpperCase(), currency: dto.currency?.toUpperCase(), organizationId } });
      await this.audit(db, principal, "KNOWLEDGE_PRODUCT_CREATED", "Product", item.id);
      return item;
    }));
  }

  async updateProduct(principal: AuthPrincipal, id: string, dto: UpdateProductDto) {
    const organizationId = this.organizationId(principal);
    await this.getProduct(principal, id);
    await this.category(organizationId, dto.categoryId, "PRODUCT");
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.product.update({ where: { id }, data: { ...dto, sku: dto.sku?.trim().toUpperCase(), currency: dto.currency?.toUpperCase() } });
      await this.audit(db, principal, "KNOWLEDGE_PRODUCT_UPDATED", "Product", id);
      return item;
    }));
  }

  async deleteProduct(principal: AuthPrincipal, id: string) {
    await this.getProduct(principal, id);
    return this.softDelete(principal, "Product", id, (db) => db.product.update({ where: { id }, data: { deletedAt: new Date(), active: false } }));
  }

  async listServices(principal: AuthPrincipal, query: KnowledgePageQueryDto) {
    const organizationId = this.organizationId(principal);
    const where: Prisma.ServiceWhereInput = { organizationId, deletedAt: null, ...(query.active === undefined ? {} : { active: query.active }), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.service.findMany({ where, ...this.paging(query), include: { category: { select: { id: true, name: true, slug: true } } }, orderBy: { updatedAt: query.sort } }),
      this.prisma.service.count({ where }),
    ]);
    return this.page(items, total, query);
  }

  async getService(principal: AuthPrincipal, id: string) {
    const item = await this.prisma.service.findFirst({ where: { id, organizationId: this.organizationId(principal), deletedAt: null }, include: { category: true } });
    if (!item) throw new NotFoundException("Servicio no encontrado");
    return item;
  }

  async createService(principal: AuthPrincipal, dto: CreateServiceDto) {
    const organizationId = this.organizationId(principal);
    await this.category(organizationId, dto.categoryId, "SERVICE");
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.service.create({ data: { ...dto, code: dto.code.trim().toUpperCase(), currency: dto.currency?.toUpperCase(), organizationId } });
      await this.audit(db, principal, "KNOWLEDGE_SERVICE_CREATED", "Service", item.id);
      return item;
    }));
  }

  async updateService(principal: AuthPrincipal, id: string, dto: UpdateServiceDto) {
    const organizationId = this.organizationId(principal);
    await this.getService(principal, id);
    await this.category(organizationId, dto.categoryId, "SERVICE");
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.service.update({ where: { id }, data: { ...dto, code: dto.code?.trim().toUpperCase(), currency: dto.currency?.toUpperCase() } });
      await this.audit(db, principal, "KNOWLEDGE_SERVICE_UPDATED", "Service", id);
      return item;
    }));
  }

  async deleteService(principal: AuthPrincipal, id: string) {
    await this.getService(principal, id);
    return this.softDelete(principal, "Service", id, (db) => db.service.update({ where: { id }, data: { deletedAt: new Date(), active: false } }));
  }

  async listPromotions(principal: AuthPrincipal, query: KnowledgePageQueryDto) {
    const organizationId = this.organizationId(principal);
    const where: Prisma.PromotionWhereInput = { organizationId, deletedAt: null, ...(query.active === undefined ? {} : { active: query.active }), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.promotion.findMany({ where, ...this.paging(query), orderBy: { updatedAt: query.sort } }), this.prisma.promotion.count({ where })]);
    return this.page(items, total, query);
  }

  async getPromotion(principal: AuthPrincipal, id: string) {
    const item = await this.prisma.promotion.findFirst({ where: { id, organizationId: this.organizationId(principal), deletedAt: null } });
    if (!item) throw new NotFoundException("Promoción no encontrada");
    return item;
  }

  async createPromotion(principal: AuthPrincipal, dto: CreatePromotionDto) {
    this.validatePromotion(dto.discountType, dto.discountValue, dto.startsAt, dto.endsAt);
    const organizationId = this.organizationId(principal);
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.promotion.create({ data: { ...dto, code: dto.code.trim().toUpperCase(), startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt), organizationId } });
      await this.audit(db, principal, "KNOWLEDGE_PROMOTION_CREATED", "Promotion", item.id);
      return item;
    }));
  }

  async updatePromotion(principal: AuthPrincipal, id: string, dto: UpdatePromotionDto) {
    const current = await this.getPromotion(principal, id);
    this.validatePromotion(dto.discountType ?? current.discountType, dto.discountValue ?? Number(current.discountValue), dto.startsAt ?? current.startsAt.toISOString(), dto.endsAt ?? current.endsAt.toISOString());
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.promotion.update({ where: { id }, data: { ...dto, code: dto.code?.trim().toUpperCase(), startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } });
      await this.audit(db, principal, "KNOWLEDGE_PROMOTION_UPDATED", "Promotion", id);
      return item;
    }));
  }

  async deletePromotion(principal: AuthPrincipal, id: string) {
    await this.getPromotion(principal, id);
    return this.softDelete(principal, "Promotion", id, (db) => db.promotion.update({ where: { id }, data: { deletedAt: new Date(), active: false } }));
  }

  async listSchedules(principal: AuthPrincipal, query: KnowledgePageQueryDto) {
    const organizationId = this.organizationId(principal);
    const where: Prisma.BusinessScheduleWhereInput = { organizationId, deletedAt: null, ...(query.active === undefined ? {} : { active: query.active }), ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.businessSchedule.findMany({ where, ...this.paging(query), include: { entries: { where: { deletedAt: null }, orderBy: { dayOfWeek: "asc" } } }, orderBy: { updatedAt: query.sort } }),
      this.prisma.businessSchedule.count({ where }),
    ]);
    return this.page(items, total, query);
  }

  async getSchedule(principal: AuthPrincipal, id: string) {
    const item = await this.prisma.businessSchedule.findFirst({ where: { id, organizationId: this.organizationId(principal), deletedAt: null }, include: { entries: { where: { deletedAt: null }, orderBy: { dayOfWeek: "asc" } } } });
    if (!item) throw new NotFoundException("Horario no encontrado");
    return item;
  }

  async createSchedule(principal: AuthPrincipal, dto: CreateScheduleDto) {
    const organizationId = this.organizationId(principal);
    this.validateTimezone(dto.timezone);
    const entries = this.scheduleEntries(dto.entries ?? []);
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.businessSchedule.create({ data: { organizationId, name: dto.name, timezone: dto.timezone, active: dto.active, entries: { create: entries.map((entry) => ({ ...entry, organizationId })) } }, include: { entries: true } });
      await this.audit(db, principal, "KNOWLEDGE_SCHEDULE_CREATED", "BusinessSchedule", item.id);
      return item;
    }));
  }

  async updateSchedule(principal: AuthPrincipal, id: string, dto: UpdateScheduleDto) {
    const current = await this.getSchedule(principal, id);
    if (dto.timezone) this.validateTimezone(dto.timezone);
    const entries = dto.entries === undefined ? undefined : this.scheduleEntries(dto.entries);
    const organizationId = this.organizationId(principal);
    return this.unique(() => this.prisma.$transaction(async (db) => {
      if (entries) {
        await db.scheduleEntry.updateMany({ where: { organizationId, scheduleId: id, deletedAt: null }, data: { deletedAt: new Date() } });
        for (const entry of entries) {
          await db.scheduleEntry.upsert({ where: { organizationId_scheduleId_dayOfWeek: { organizationId, scheduleId: id, dayOfWeek: entry.dayOfWeek } }, update: { ...entry, deletedAt: null }, create: { ...entry, organizationId, scheduleId: id } });
        }
      }
      const item = await db.businessSchedule.update({ where: { id }, data: { name: dto.name, timezone: dto.timezone, active: dto.active }, include: { entries: { where: { deletedAt: null }, orderBy: { dayOfWeek: "asc" } } } });
      await this.audit(db, principal, "KNOWLEDGE_SCHEDULE_UPDATED", "BusinessSchedule", current.id);
      return item;
    }));
  }

  async deleteSchedule(principal: AuthPrincipal, id: string) {
    const organizationId = this.organizationId(principal);
    await this.getSchedule(principal, id);
    return this.prisma.$transaction(async (db) => {
      const deletedAt = new Date();
      await db.scheduleEntry.updateMany({ where: { organizationId, scheduleId: id, deletedAt: null }, data: { deletedAt } });
      await db.businessSchedule.update({ where: { id }, data: { deletedAt, active: false } });
      await this.audit(db, principal, "KNOWLEDGE_SCHEDULE_DELETED", "BusinessSchedule", id);
      return { ok: true };
    });
  }

  async listPolicies(principal: AuthPrincipal, query: KnowledgePageQueryDto) {
    const organizationId = this.organizationId(principal);
    const where: Prisma.PolicyWhereInput = { organizationId, deletedAt: null, ...(query.active === undefined ? {} : { active: query.active }), ...(query.search ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { content: { contains: query.search, mode: "insensitive" } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.policy.findMany({ where, ...this.paging(query), include: { category: { select: { id: true, name: true, slug: true } } }, orderBy: { updatedAt: query.sort } }),
      this.prisma.policy.count({ where }),
    ]);
    return this.page(items, total, query);
  }

  async getPolicy(principal: AuthPrincipal, id: string) {
    const item = await this.prisma.policy.findFirst({ where: { id, organizationId: this.organizationId(principal), deletedAt: null }, include: { category: true } });
    if (!item) throw new NotFoundException("Política no encontrada");
    return item;
  }

  async createPolicy(principal: AuthPrincipal, dto: CreatePolicyDto) {
    const organizationId = this.organizationId(principal);
    await this.category(organizationId, dto.categoryId, "POLICY");
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.policy.create({ data: { ...dto, organizationId } });
      await this.audit(db, principal, "KNOWLEDGE_POLICY_CREATED", "Policy", item.id);
      return item;
    }));
  }

  async updatePolicy(principal: AuthPrincipal, id: string, dto: UpdatePolicyDto) {
    const organizationId = this.organizationId(principal);
    await this.getPolicy(principal, id);
    await this.category(organizationId, dto.categoryId, "POLICY");
    return this.unique(() => this.prisma.$transaction(async (db) => {
      const item = await db.policy.update({ where: { id }, data: dto });
      await this.audit(db, principal, "KNOWLEDGE_POLICY_UPDATED", "Policy", id);
      return item;
    }));
  }

  async deletePolicy(principal: AuthPrincipal, id: string) {
    await this.getPolicy(principal, id);
    return this.softDelete(principal, "Policy", id, (db) => db.policy.update({ where: { id }, data: { deletedAt: new Date(), active: false } }));
  }

  private validatePromotion(type: string, value: number, startsAt: string, endsAt: string) {
    if (!type || value === undefined || !startsAt || !endsAt) throw new BadRequestException("La promoción requiere tipo, valor y vigencia");
    if (type === "PERCENTAGE" && value > 100) throw new BadRequestException("El porcentaje no puede superar 100");
    if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) throw new BadRequestException("La fecha de término debe ser posterior a la fecha de inicio");
  }

  private validateTimezone(timezone: string) {
    if (!timezone) throw new BadRequestException("La zona horaria es obligatoria");
    try { new Intl.DateTimeFormat("es-MX", { timeZone: timezone }).format(); }
    catch { throw new BadRequestException("Zona horaria inválida"); }
  }

  private scheduleEntries(entries: ScheduleEntryDto[]) {
    const days = new Set<string>();
    return entries.map((entry) => {
      if (days.has(entry.dayOfWeek)) throw new BadRequestException("No se puede repetir un día en el mismo horario");
      days.add(entry.dayOfWeek);
      if (entry.closed) return { dayOfWeek: entry.dayOfWeek, opensAt: null, closesAt: null, closed: true };
      if (!entry.opensAt || !entry.closesAt) throw new BadRequestException("Los días abiertos requieren hora de apertura y cierre");
      if (entry.opensAt >= entry.closesAt) throw new BadRequestException("La hora de cierre debe ser posterior a la apertura");
      return { dayOfWeek: entry.dayOfWeek, opensAt: entry.opensAt, closesAt: entry.closesAt, closed: false };
    });
  }

  private softDelete<T>(principal: AuthPrincipal, entityType: string, id: string, operation: (db: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (db) => {
      await operation(db);
      await this.audit(db, principal, `KNOWLEDGE_${entityType.toUpperCase()}_DELETED`, entityType, id);
      return { ok: true };
    });
  }
}
