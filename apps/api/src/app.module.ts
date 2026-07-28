import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AIProviderService } from "./ai-provider.service";
import { BillingModule } from "./billing/billing.module";
import { validateEnvironment } from "./config";
import { HealthController } from "./health.controller";
import { KnowledgeBaseModule } from "./knowledge-base/knowledge-base.module";
import { PrismaService } from "./prisma.service";
import { RequestContextMiddleware } from "./request-context";
import { ResourceService } from "./resource.service";
import { ResourcesController } from "./resources.controller";
import { CsrfGuard, RolesGuard, SessionGuard, TenantGuard } from "./security";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), JwtModule.register({ global: true }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), KnowledgeBaseModule, BillingModule],
  controllers: [AuthController, HealthController, ResourcesController],
  providers: [PrismaService, AuthService, ResourceService, AIProviderService, SessionGuard, TenantGuard, CsrfGuard, RolesGuard, ConfigService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(RequestContextMiddleware).forRoutes("*"); }
}
