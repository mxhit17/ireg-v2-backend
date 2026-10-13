import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { cloudinaryProvider } from './cloudinary.provider';

@Module({
  imports: [ConfigModule],
  controllers: [MediaController],
  providers: [
    cloudinaryProvider,
    MediaService,
  ],
  exports: [
    MediaService,
  ],
})
export class MediaModule {}