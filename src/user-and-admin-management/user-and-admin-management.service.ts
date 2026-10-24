import {
    BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MediaService } from 'src/media/media.service';

@Injectable()
export class UserAndAdminManagementService {
  private readonly logger = new Logger(
    UserAndAdminManagementService.name,
  );
  constructor(private readonly prisma: PrismaService, private readonly mediaService: MediaService) {}

  async getProfile(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Invalid authentication');
    }

    const user = await this.prisma.users.findFirst({
      where: {
        id: userId,
        deleted_at: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        profile_image_url: true,
        is_verified: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    return {
      success: true,
      message: 'User profile fetched successfully',
      data: user,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (!userId) {
        throw new UnauthorizedException('Invalid authentication');
    }

    // Only allow explicitly approved profile fields.
    const data: {
        name?: string;
        phone?: string | null;
        profile_image_url?: string | null;
        updated_at: Date;
    } = {
        updated_at: new Date(),
    };

    if (dto.name !== undefined) {
        data.name = dto.name.trim();

        if (!data.name) {
        throw new BadRequestException(
            'Name cannot be empty',
        );
        }
    }

    if (dto.phone !== undefined) {
        data.phone = dto.phone?.trim() || null;
    }

    if (dto.profile_image_url !== undefined) {
        data.profile_image_url =
        dto.profile_image_url?.trim() || null;
    }

    if (
        dto.name === undefined &&
        dto.phone === undefined &&
        dto.profile_image_url === undefined
    ) {
        throw new BadRequestException(
        'Provide at least one field to update',
        );
    }

    const existingUser = await this.prisma.users.findFirst({
        where: {
        id: userId,
        deleted_at: null,
        status: 'ACTIVE',
        },
        select: {
        id: true,
        },
    });

    if (!existingUser) {
        throw new NotFoundException('User profile not found');
    }

    const user = await this.prisma.users.update({
        where: {
        id: userId,
        },
        data,
        select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        profile_image_url: true,
        is_verified: true,
        status: true,
        created_at: true,
        updated_at: true,
        },
    });

    return {
        success: true,
        message: 'User profile updated successfully',
        data: user,
    };
  }

  async updateProfilePhoto(
    userId: string,
    file: Express.Multer.File,
  ) {
    if (!userId) {
      throw new UnauthorizedException(
        'Invalid authentication',
      );
    }

    if (!file) {
      throw new BadRequestException(
        'Profile image is required',
      );
    }

    // 1. Fetch the user and their existing Cloudinary public ID.
    const existingUser = await this.prisma.users.findFirst({
      where: {
        id: userId,
        deleted_at: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        profile_image_public_id: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException(
        'User profile not found',
      );
    }

    // 2. Upload the new image before touching the old one.
    const newImage = await this.mediaService.uploadImage(
      file,
      'ireg/profile-images',
    );

    try {
      // 3. Update the URL and public ID together in PostgreSQL.
      const updatedUser = await this.prisma.users.update({
        where: {
          id: userId,
        },
        data: {
          profile_image_url: newImage.url,
          profile_image_public_id: newImage.publicId,
          updated_at: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          profile_image_url: true,
          is_verified: true,
          status: true,
          created_at: true,
          updated_at: true,
        },
      });

      // 4. Delete the previous image only after the DB update succeeds.
      const oldPublicId = existingUser.profile_image_public_id;

      if (oldPublicId && oldPublicId !== newImage.publicId) {
        try {
          await this.mediaService.deleteImage(oldPublicId);
        } catch (error) {
          // The new image is already saved. Do not fail the request
          // merely because cleanup of the old image failed.
          this.logger.error(
            `Failed to delete old profile image: ${oldPublicId}`,
            error instanceof Error
              ? error.stack
              : String(error),
          );
        }
      }

      return {
        success: true,
        message: 'Profile photo updated successfully',
        data: updatedUser,
      };
    } catch (error) {
      // 5. The DB update failed, so try to remove the new upload.
      try {
        await this.mediaService.deleteImage(newImage.publicId);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to clean up new profile image: ${newImage.publicId}`,
          cleanupError instanceof Error
            ? cleanupError.stack
            : String(cleanupError),
        );
      }

      throw error;
    }
  }

  async getSavedProjects(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Invalid authentication');
    }

    const savedProjects = await this.prisma.saved_projects.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: 'desc',
      },
      select: {
        created_at: true,
        projects: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            project_type: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Saved projects fetched successfully',
      data: savedProjects.map((saved) => ({
        ...saved.projects,
        saved_at: saved.created_at,
      })),
      count: savedProjects.length,
    };
  }
}
