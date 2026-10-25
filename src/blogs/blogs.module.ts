import { Module } from '@nestjs/common';
import { BlogsController } from './blogs.controller';
import { AdminBlogsController } from './admin-blogs.controller';
import { BlogsService } from './blogs.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BlogsController, AdminBlogsController],
  providers: [BlogsService],
})
export class BlogsModule {}
