import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from 'src/media/media.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [PrismaModule, MediaModule, MailModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
