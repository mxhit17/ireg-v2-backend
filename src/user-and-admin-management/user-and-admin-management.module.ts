import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserAndAdminManagementController } from './user-and-admin-management.controller';
import { UserAndAdminManagementService } from './user-and-admin-management.service';
import { MediaModule } from 'src/media/media.module';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [UserAndAdminManagementController],
  providers: [UserAndAdminManagementService],
})
export class UserAndAdminManagementModule {}
