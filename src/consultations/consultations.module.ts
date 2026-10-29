import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { CashfreeService } from './cashfree.service';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, CashfreeService],
})
export class ConsultationsModule {}
