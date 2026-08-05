import { Module } from "@nestjs/common";
import { AIProviderService } from "../ai-provider.service";
import { AuthModule } from "../auth.module";
import { PrismaService } from "../prisma.service";
import { ResourceService } from "../resource.service";
import { MetaOAuthController } from "./meta-oauth.controller";
import { MetaOAuthService } from "./meta-oauth.service";
import { MetaWebhookController } from "./meta-webhook.controller";
import { MetaWebhookService } from "./meta-webhook.service";

@Module({
  imports: [AuthModule],
  controllers: [MetaWebhookController, MetaOAuthController],
  providers: [MetaWebhookService, MetaOAuthService, PrismaService, ResourceService, AIProviderService],
  exports: [MetaWebhookService, MetaOAuthService],
})
export class MetaWebhookModule {}
