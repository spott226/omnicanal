import { Module } from "@nestjs/common";
import { AuthModule } from "../auth.module";
import { PrismaService } from "../prisma.service";
import { KnowledgeBaseController } from "./knowledge-base.controller";
import { KnowledgeBaseService } from "./knowledge-base.service";

@Module({
  imports: [AuthModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, PrismaService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
