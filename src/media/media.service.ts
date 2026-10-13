import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { v2 as Cloudinary } from 'cloudinary';

import { CLOUDINARY } from './cloudinary.provider';

@Injectable()
export class MediaService {
  constructor(
    @Inject(CLOUDINARY)
    private readonly cloudinary: typeof Cloudinary,
  ) {}

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{
    url: string;
    publicId: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
  }> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = this.cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'image',
            transformation: [
              {
                quality: 'auto',
                fetch_format: 'auto',
              },
            ],
          },
          (error, result) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          },
        );

        uploadStream.end(file.buffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      console.error('Cloudinary upload failed:', error);

      throw new InternalServerErrorException(
        'Failed to upload image',
      );
    }
  }

  async deleteImage(publicId: string): Promise<void> {
    console.log('Deleting Cloudinary public ID:', publicId);

    try {
        const result = await this.cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'upload',
        invalidate: true,
        });

        console.log('Cloudinary destroy response:', result);

        if (result.result !== 'ok') {
        throw new NotFoundException(
            `Cloudinary image not found: ${publicId}`,
        );
        }
    } catch (error) {
        console.error('Cloudinary deletion failed:', error);

        if (error instanceof NotFoundException) {
        throw error;
        }

        throw new InternalServerErrorException(
        'Failed to delete image',
        );
    }
  }
}