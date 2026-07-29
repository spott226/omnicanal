import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";
import { PrismaService } from "../prisma.service";
import { CsrfGuard, RolesGuard, SessionGuard, SubscriptionGuard, TenantGuard } from "../security";
import { BillingController } from "./billing.controller";
import { BillingProviderService } from "./billing-provider.service";
import { BillingService } from "./billing.service";

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingProviderService, PrismaService, ConfigService, AuthService, SessionGuard, TenantGuard, SubscriptionGuard, CsrfGuard, RolesGuard],
  exports: [BillingService, BillingProviderService],
})
export class BillingModule {}
