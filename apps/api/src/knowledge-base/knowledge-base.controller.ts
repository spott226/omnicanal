import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import type { AuthPrincipal } from "../../../../packages/shared/src/index";
import { CurrentPrincipal, Protected } from "../security";
import {
  CreateFaqDto,
  CreatePolicyDto,
  CreateProductDto,
  CreatePromotionDto,
  CreateScheduleDto,
  CreateServiceDto,
  KnowledgePageQueryDto,
  UpdateFaqDto,
  UpdatePolicyDto,
  UpdateProductDto,
  UpdatePromotionDto,
  UpdateScheduleDto,
  UpdateServiceDto,
} from "./knowledge-base.dto";
import { KnowledgeBaseService } from "./knowledge-base.service";

const READERS = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "SUPERVISOR", "AGENT"] as const;
const EDITORS = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "SUPERVISOR"] as const;
const ADMINS = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"] as const;

@Controller("knowledge-base")
export class KnowledgeBaseController {
  constructor(@Inject(KnowledgeBaseService) private readonly knowledge: KnowledgeBaseService) {}

  @Get("faqs") @Protected(...READERS) listFaqs(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: KnowledgePageQueryDto) { return this.knowledge.listFaqs(principal, query); }
  @Get("faqs/:id") @Protected(...READERS) getFaq(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.getFaq(principal, id); }
  @Post("faqs") @Protected(...EDITORS) createFaq(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateFaqDto) { return this.knowledge.createFaq(principal, dto); }
  @Patch("faqs/:id") @Protected(...EDITORS) updateFaq(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto) { return this.knowledge.updateFaq(principal, id, dto); }
  @Delete("faqs/:id") @Protected(...ADMINS) deleteFaq(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.deleteFaq(principal, id); }

  @Get("products") @Protected(...READERS) listProducts(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: KnowledgePageQueryDto) { return this.knowledge.listProducts(principal, query); }
  @Get("products/:id") @Protected(...READERS) getProduct(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.getProduct(principal, id); }
  @Post("products") @Protected(...EDITORS) createProduct(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateProductDto) { return this.knowledge.createProduct(principal, dto); }
  @Patch("products/:id") @Protected(...EDITORS) updateProduct(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) { return this.knowledge.updateProduct(principal, id, dto); }
  @Delete("products/:id") @Protected(...ADMINS) deleteProduct(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.deleteProduct(principal, id); }

  @Get("services") @Protected(...READERS) listServices(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: KnowledgePageQueryDto) { return this.knowledge.listServices(principal, query); }
  @Get("services/:id") @Protected(...READERS) getService(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.getService(principal, id); }
  @Post("services") @Protected(...EDITORS) createService(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateServiceDto) { return this.knowledge.createService(principal, dto); }
  @Patch("services/:id") @Protected(...EDITORS) updateService(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) { return this.knowledge.updateService(principal, id, dto); }
  @Delete("services/:id") @Protected(...ADMINS) deleteService(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.deleteService(principal, id); }

  @Get("promotions") @Protected(...READERS) listPromotions(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: KnowledgePageQueryDto) { return this.knowledge.listPromotions(principal, query); }
  @Get("promotions/:id") @Protected(...READERS) getPromotion(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.getPromotion(principal, id); }
  @Post("promotions") @Protected(...EDITORS) createPromotion(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreatePromotionDto) { return this.knowledge.createPromotion(principal, dto); }
  @Patch("promotions/:id") @Protected(...EDITORS) updatePromotion(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto) { return this.knowledge.updatePromotion(principal, id, dto); }
  @Delete("promotions/:id") @Protected(...ADMINS) deletePromotion(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.deletePromotion(principal, id); }

  @Get("schedules") @Protected(...READERS) listSchedules(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: KnowledgePageQueryDto) { return this.knowledge.listSchedules(principal, query); }
  @Get("schedules/:id") @Protected(...READERS) getSchedule(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.getSchedule(principal, id); }
  @Post("schedules") @Protected(...EDITORS) createSchedule(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateScheduleDto) { return this.knowledge.createSchedule(principal, dto); }
  @Patch("schedules/:id") @Protected(...EDITORS) updateSchedule(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateScheduleDto) { return this.knowledge.updateSchedule(principal, id, dto); }
  @Delete("schedules/:id") @Protected(...ADMINS) deleteSchedule(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.deleteSchedule(principal, id); }

  @Get("policies") @Protected(...READERS) listPolicies(@CurrentPrincipal() principal: AuthPrincipal, @Query() query: KnowledgePageQueryDto) { return this.knowledge.listPolicies(principal, query); }
  @Get("policies/:id") @Protected(...READERS) getPolicy(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.getPolicy(principal, id); }
  @Post("policies") @Protected(...EDITORS) createPolicy(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreatePolicyDto) { return this.knowledge.createPolicy(principal, dto); }
  @Patch("policies/:id") @Protected(...EDITORS) updatePolicy(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePolicyDto) { return this.knowledge.updatePolicy(principal, id, dto); }
  @Delete("policies/:id") @Protected(...ADMINS) deletePolicy(@CurrentPrincipal() principal: AuthPrincipal, @Param("id", ParseUUIDPipe) id: string) { return this.knowledge.deletePolicy(principal, id); }
}
