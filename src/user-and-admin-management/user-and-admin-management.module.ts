import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserAndAdminManagementController } from './user-and-admin-management.controller';
import { UserAndAdminManagementService } from './user-and-admin-management.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserAndAdminManagementController],
  providers: [UserAndAdminManagementService],
})
export class UserAndAdminManagementModule {}
