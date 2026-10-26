import { Module } from '@nestjs/common';
import { BlogsController } from './blogs.controller';
import { AdminBlogsController } from './admin-blogs.controller';
import { BlogsService } from './blogs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaService } from 'src/media/media.service';
import { MediaModule } from 'src/media/media.module';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [BlogsController, AdminBlogsController],
  providers: [BlogsService],
})
export class BlogsModule {}
