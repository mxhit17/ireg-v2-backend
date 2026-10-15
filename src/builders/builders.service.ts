
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuilderDto } from './dto/create-builder.dto';
import { PaginationDto } from 'src/common/pagination/pagination.dto';
import { paginate } from 'src/common/pagination/pagination.util';
import { UpdateBuilderDto } from './dto/update-builder.dto';

@Injectable()
export class BuildersService {
  constructor(private readonly prisma: PrismaService) {}

  private generateSlug(name: string): string {
    return name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 220)
      .replace(/-+$/g, '');
  }

  async create(dto: CreateBuilderDto) {
    const name = dto.name.trim();

    if (!name) {
      throw new ConflictException('Builder name cannot be empty.');
    }

    // Reject duplicate active builder names, ignoring case.
    const existingBuilder = await this.prisma.builders.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deleted_at: null,
      },
      select: { id: true },
    });

    if (existingBuilder) {
      throw new ConflictException(
        'A builder with this name already exists.',
      );
    }

    const baseSlug = this.generateSlug(name);

    if (!baseSlug) {
      throw new ConflictException(
        'Builder name cannot be converted into a valid slug.',
      );
    }

    // Ensure the slug is unique, including soft-deleted records.
    let slug = baseSlug;
    let suffix = 1;

    while (
      await this.prisma.builders.findUnique({
        where: { slug },
        select: { id: true },
      })
    ) {
      const suffixText = `-${suffix++}`;
      slug = `${baseSlug.slice(0, 220 - suffixText.length)}${suffixText}`;
    }

    return this.prisma.builders.create({
      data: {
        name,
        slug,
        description: dto.description?.trim() || null,
        logo_url: dto.logo_url?.trim() || null,
        website_url: dto.website_url?.trim() || null,
      },
    });
  }

  async getAllBuilders(query: PaginationDto) {
    const { page, limit } = query;

    return paginate({
      page,
      limit,

      findMany: (skip, take) =>
        this.prisma.builders.findMany({
          skip,
          take,
          orderBy: [
            { created_at: 'desc' },
            { id: 'desc' },
          ],
        }),

      count: () =>
        this.prisma.builders.count(),
    });
  }

  async getBuilderById(id: string) {
    const builder = await this.prisma.builders.findFirst({
      where: {
        id,
        deleted_at: null,
      },
    });

    if (!builder) {
      throw new NotFoundException(
        'Builder not found.',
      );
    }

    return builder;
  }

  async deleteBuilder(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const builder = await tx.builders.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!builder) {
        throw new NotFoundException('Builder not found.');
      }

      const projectCount = await tx.projects.count({
        where: {
          builder_id: id,
        },
      });

      if (projectCount > 0) {
        throw new ConflictException(
          `Cannot delete builder because ${projectCount} project(s) are associated with it.`,
        );
      }

      await tx.builders.update({
        where: {
          id,
        },
        data: {
          deleted_at: new Date(),
        },
      });

      return {
        message: 'Builder deleted successfully.',
        id: builder.id,
      };
    });
  }

  async updateBuilder(id: string, dto: UpdateBuilderDto) {
    const builder = await this.prisma.builders.findFirst({
      where: {
        id,
        deleted_at: null,
      },
    });

    if (!builder) {
      throw new NotFoundException('Builder not found.');
    }

    const data: {
      name?: string;
      slug?: string;
      description?: string | null;
      website_url?: string | null;
    } = {};

    // Update name and regenerate slug only when the name changes.
    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (!name) {
        throw new BadRequestException(
          'Builder name cannot be empty.',
        );
      }

      if (name !== builder.name) {
        const existingBuilder =
          await this.prisma.builders.findFirst({
            where: {
              name: {
                equals: name,
                mode: 'insensitive',
              },
              deleted_at: null,
              id: { not: id },
            },
            select: { id: true },
          });

        if (existingBuilder) {
          throw new ConflictException(
            'A builder with this name already exists.',
          );
        }

        const baseSlug = this.generateSlug(name);

        if (!baseSlug) {
          throw new BadRequestException(
            'Builder name cannot be converted into a valid slug.',
          );
        }

        // Check all records, including soft-deleted builders.
        let slug = baseSlug;
        let suffix = 1;

        while (true) {
          const existingSlug =
            await this.prisma.builders.findUnique({
              where: { slug },
              select: { id: true },
            });

          if (!existingSlug || existingSlug.id === id) {
            break;
          }

          const suffixText = `-${suffix++}`;
          slug = `${baseSlug.slice(0, 220 - suffixText.length)}${suffixText}`;
        }

        data.name = name;
        data.slug = slug;
      }
    }

    if (dto.description !== undefined) {
      data.description =
        typeof dto.description === 'string'
          ? dto.description.trim() || null
          : null;
    }

    if (dto.website_url !== undefined) {
      data.website_url =
        typeof dto.website_url === 'string'
          ? dto.website_url.trim() || null
          : null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'At least one valid field must be provided for update.',
      );
    }

    return this.prisma.builders.update({
      where: { id },
      data,
    });
  }
}
