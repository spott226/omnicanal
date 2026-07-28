import { Module } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { PrismaService } from "../prisma.service";
import { CsrfGuard, RolesGuard, SessionGuard, TenantGuard } from "../security";
import { KnowledgeBaseController } from "./knowledge-base.controller";
import { KnowledgeBaseService } from "./knowledge-base.service";

@Module({
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, PrismaService, AuthService, SessionGuard, TenantGuard, CsrfGuard, RolesGuard],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
