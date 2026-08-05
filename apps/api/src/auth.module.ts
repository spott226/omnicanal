import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaService } from "./prisma.service";
import { CsrfGuard, RolesGuard, SessionGuard, SubscriptionGuard, TenantGuard } from "./security";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, SessionGuard, TenantGuard, SubscriptionGuard, CsrfGuard, RolesGuard],
  exports: [AuthService, SessionGuard, TenantGuard, SubscriptionGuard, CsrfGuard, RolesGuard],
})
export class AuthModule {}
