import {
  Controller,
  Delete,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.mediaService.uploadImage(
      file,
      'ireg/test_images',
    );

    return {
      success: true,
      message: 'Image uploaded successfully',
      data: result,
    };
  }

  @Delete()
  async deleteImage(
    @Query('publicId') publicId: string,
  ) {
    await this.mediaService.deleteImage(publicId);

    return {
      success: true,
      message: 'Image deleted successfully',
    };
  }
}