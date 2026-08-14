import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  // Let Prisma connect when the first database operation is made. This keeps
  // the HTTP process responsive for Railway's startup health check while the
  // database client handles its own connection lifecycle.
  async onModuleDestroy() { await this.$disconnect(); }
}
