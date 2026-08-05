import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth.module";
import { PrismaService } from "../prisma.service";
import { BillingController } from "./billing.controller";
import { BillingProviderService } from "./billing-provider.service";
import { BillingService } from "./billing.service";

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, BillingProviderService, PrismaService, ConfigService],
  exports: [BillingService, BillingProviderService],
})
export class BillingModule {}
