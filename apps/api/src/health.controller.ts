import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get()
  health() {
    return { status: "ok", service: "api", timestamp: new Date().toISOString() };
  }

  @Get("deep")
  async deepHealth() {
    try { await this.prisma.$queryRaw`SELECT 1`; return { status: "ok", database: "connected", timestamp: new Date().toISOString() }; }
    catch { throw new ServiceUnavailableException({ status: "unavailable", database: "disconnected" }); }
  }
}
