// import { Module } from '@nestjs/common';
// import { PopularityController } from './popularity.controller';
// import { PopularityService } from './popularity.service';

// @Module({
//   controllers: [PopularityController],
//   providers: [PopularityService]
// })
// export class PopularityModule {}

import { Module } from '@nestjs/common';
import { PopularityService } from './popularity.service';
import { PopularityController } from './popularity.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PopularityController],
  providers: [PopularityService],
  exports: [PopularityService],
})
export class PopularityModule {}