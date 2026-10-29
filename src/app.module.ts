import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { UserAndAdminManagementModule } from './user-and-admin-management/user-and-admin-management.module';
import { BuildersController } from './builders/builders.controller';
import { BuildersModule } from './builders/builders.module';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsModule } from './projects/projects.module';
import { CommentsController } from './comments/comments.controller';
import { CommentsModule } from './comments/comments.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PopularityModule } from './popularity/popularity.module';
import { HomeModule } from './home/home.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { BlogsModule } from './blogs/blogs.module';
import { ConsultationsModule } from './consultations/consultations.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    MailModule,
    UserAndAdminManagementModule,
    BuildersModule,
    ProjectsModule,
    CommentsModule,
    PopularityModule,
    HomeModule,
    KnowledgeModule,
    BlogsModule,
    ConsultationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
