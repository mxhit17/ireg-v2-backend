
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuilderDto } from './dto/create-builder.dto';
import { PaginationDto } from 'src/common/pagination/pagination.dto';
import { paginate } from 'src/common/pagination/pagination.util';

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

}
