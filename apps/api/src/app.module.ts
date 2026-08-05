import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth.module";
import { AIProviderService } from "./ai-provider.service";
import { ChannelProviderService } from "./channel-provider.service";
import { BillingModule } from "./billing/billing.module";
import { validateEnvironment } from "./config";
import { HealthController } from "./health.controller";
import { KnowledgeBaseModule } from "./knowledge-base/knowledge-base.module";
import { MetaWebhookModule } from "./meta-webhook/meta-webhook.module";
import { PrismaService } from "./prisma.service";
import { RequestContextMiddleware } from "./request-context";
import { ResourceService } from "./resource.service";
import { ResourcesController } from "./resources.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), JwtModule.register({ global: true }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), AuthModule, KnowledgeBaseModule, BillingModule, MetaWebhookModule],
  controllers: [HealthController, ResourcesController],
  providers: [PrismaService, ResourceService, AIProviderService, ChannelProviderService, ConfigService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(RequestContextMiddleware).forRoutes("*"); }
}
