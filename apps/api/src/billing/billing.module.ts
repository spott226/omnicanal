import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";
import { PrismaService } from "../prisma.service";
import { CsrfGuard, RolesGuard, SessionGuard, TenantGuard } from "../security";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  controllers: [BillingController],
  providers: [BillingService, PrismaService, ConfigService, AuthService, SessionGuard, TenantGuard, CsrfGuard, RolesGuard],
  exports: [BillingService],
})
export class BillingModule {}
