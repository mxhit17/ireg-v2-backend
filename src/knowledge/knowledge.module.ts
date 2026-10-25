import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeAdminController } from './knowledge-admin.controller';
import { KnowledgeService } from './knowledge.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KnowledgeController, KnowledgeAdminController],
  providers: [KnowledgeService],
})
export class KnowledgeModule {}
