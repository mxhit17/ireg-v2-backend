import {
    BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UserAndAdminManagementService {
  constructor(private readonly prisma: PrismaService) {}

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
}
