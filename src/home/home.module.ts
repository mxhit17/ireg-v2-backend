import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PopularityModule } from '../popularity/popularity.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [PrismaModule, PopularityModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
