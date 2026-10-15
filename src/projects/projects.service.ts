

// @Injectable()
// export class ProjectsService {}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { paginate } from 'src/common/pagination/pagination.util';
import { PaginationDto } from 'src/common/pagination/pagination.dto';
import { Prisma } from 'src/generated/prisma/client';
import { UpdateProjectDto } from './dto/update-project.dto';
import { MediaService } from 'src/media/media.service';
import { CreateProjectImageDto } from './dto/create-project-image.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService, private readonly mediaService: MediaService) {}

  private generateSlug(name: string): string {
    return name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 280)
      .replace(/-+$/g, '');
  }

  async createProject(dto: CreateProjectDto) {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException(
        'Project name cannot be empty.',
      );
    }

    // Validate price range.
    if (
      dto.min_price != null &&
      dto.max_price != null &&
      dto.min_price > dto.max_price
    ) {
      throw new BadRequestException(
        'Minimum price cannot be greater than maximum price.',
      );
    }

    // Validate the builder exists and is not soft-deleted.
    const builder = await this.prisma.builders.findFirst({
      where: {
        id: dto.builder_id,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!builder) {
      throw new NotFoundException(
        'Builder not found or has been deleted.',
      );
    }

    const baseSlug = this.generateSlug(name);

    if (!baseSlug) {
      throw new BadRequestException(
        'Project name cannot be converted into a valid slug.',
      );
    }

    // Slugs must be unique per builder among active projects.
    let slug = baseSlug;
    let suffix = 1;

    while (
      await this.prisma.projects.findFirst({
        where: {
          builder_id: builder.id,
          slug,
          deleted_at: null,
        },
        select: { id: true },
      })
    ) {
      const suffixText = `-${suffix++}`;

      slug = `${baseSlug.slice(
        0,
        280 - suffixText.length,
      )}${suffixText}`;
    }

    try {
      return await this.prisma.projects.create({
        data: {
          builder_id: builder.id,
          name,
          slug,
          description: dto.description?.trim() || null,
          project_type: dto.project_type,
          status: dto.status,
          location: dto.location?.trim() || null,
          locality: dto.locality?.trim() || null,
          city: dto.city?.trim() || null,
          state: dto.state?.trim() || null,
          country:
            dto.country === undefined
              ? undefined
              : dto.country?.trim() || null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          min_price: dto.min_price ?? null,
          max_price: dto.max_price ?? null,
          currency: dto.currency?.toUpperCase() ?? 'INR',
        },
        include: {
          builders: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo_url: true,
            },
          },
        },
      });
    } catch (error) {
      // The database unique constraint also protects against
      // concurrent requests generating the same slug.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A project with this slug already exists for this builder. Please retry.',
        );
      }

      throw error;
    }
  }

  async getAllProjects(query: PaginationDto) {
    const { page, limit } = query;

    const where = {
        deleted_at: null,
    };

    return paginate({
        page,
        limit,

        findMany: (skip, take) =>
        this.prisma.projects.findMany({
            where,
            skip,
            take,
            orderBy: [
            { created_at: 'desc' },
            { id: 'desc' },
            ],
            include: {
            builders: {
                select: {
                id: true,
                name: true,
                slug: true,
                logo_url: true,
                },
            },
            project_images: true,
            },
        }),

        count: () =>
        this.prisma.projects.count({
            where,
        }),
    });
    }

async getProjectById(id: string) {
  const project = await this.prisma.projects.findFirst({
    where: {
      id,
      deleted_at: null,
    },
    include: {
      builders: {
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
          website_url: true,
        },
      },
      project_images: true,
    },
  });

  if (!project) {
    throw new NotFoundException('Project not found.');
  }

  return project;
}

async deleteProject(id: string) {
  return this.prisma.$transaction(async (tx) => {
    const project = await tx.projects.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    await tx.projects.update({
      where: {
        id: project.id,
      },
      data: {
        deleted_at: new Date(),
        updated_at: new Date(),
      },
    });

    return {
      success: true,
      message: 'Project deleted successfully.',
      id: project.id,
    };
  });
}

async updateProject(id: string, dto: UpdateProjectDto) {
    const project = await this.prisma.projects.findFirst({
      where: {
        id,
        deleted_at: null,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    // Resolve the builder that will be associated with the project.
    const builderId = dto.builder_id ?? project.builder_id;

    if (dto.builder_id !== undefined) {
      const builder = await this.prisma.builders.findFirst({
        where: {
          id: builderId,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (!builder) {
        throw new NotFoundException(
          'Builder not found or has been deleted.',
        );
      }
    }

    const name =
      dto.name !== undefined ? dto.name.trim() : project.name;

    if (!name) {
      throw new BadRequestException(
        'Project name cannot be empty.',
      );
    }

    // Validate the resulting price range, including unchanged values.
    const minPrice =
      dto.min_price !== undefined
        ? dto.min_price
        : project.min_price?.toNumber() ?? null;

    const maxPrice =
      dto.max_price !== undefined
        ? dto.max_price
        : project.max_price?.toNumber() ?? null;

    if (
      minPrice !== null &&
      maxPrice !== null &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException(
        'Minimum price cannot be greater than maximum price.',
      );
    }

    const data: Prisma.projectsUncheckedUpdateInput = {
      updated_at: new Date(),
    };

    if (dto.builder_id !== undefined) {
      data.builder_id = builderId;
    }

    if (dto.name !== undefined) {
      data.name = name;
    }

    if (dto.description !== undefined) {
      data.description =
        dto.description?.trim() || null;
    }

    if (dto.project_type !== undefined) {
      data.project_type = dto.project_type;
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    if (dto.location !== undefined) {
      data.location = dto.location?.trim() || null;
    }

    if (dto.locality !== undefined) {
      data.locality = dto.locality?.trim() || null;
    }

    if (dto.city !== undefined) {
      data.city = dto.city?.trim() || null;
    }

    if (dto.state !== undefined) {
      data.state = dto.state?.trim() || null;
    }

    if (dto.country !== undefined) {
      data.country = dto.country?.trim() || null;
    }

    if (dto.latitude !== undefined) {
      data.latitude = dto.latitude;
    }

    if (dto.longitude !== undefined) {
      data.longitude = dto.longitude;
    }

    if (dto.min_price !== undefined) {
      data.min_price = dto.min_price;
    }

    if (dto.max_price !== undefined) {
      data.max_price = dto.max_price;
    }

    if (dto.currency !== undefined) {
      data.currency = dto.currency.toUpperCase();
    }

    // Regenerate slug when either the name or builder changes.
    const builderChanged = builderId !== project.builder_id;
    const nameChanged = name !== project.name;

    if (nameChanged || builderChanged) {
      const baseSlug = this.generateSlug(name);

      if (!baseSlug) {
        throw new BadRequestException(
          'Project name cannot be converted into a valid slug.',
        );
      }

      let slug = baseSlug;
      let suffix = 1;

      while (true) {
        const existingProject =
          await this.prisma.projects.findFirst({
            where: {
              builder_id: builderId,
              slug,
              deleted_at: null,
              id: { not: id },
            },
            select: { id: true },
          });

        if (!existingProject) {
          break;
        }

        const suffixText = `-${suffix++}`;
        slug = `${baseSlug.slice(
          0,
          280 - suffixText.length,
        )}${suffixText}`;
      }

      data.slug = slug;
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'At least one field must be provided for update.',
      );
    }

    try {
      return await this.prisma.projects.update({
        where: { id },
        data,
        include: {
          builders: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo_url: true,
            },
          },
          project_images: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A project with this slug already exists for this builder. Please retry.',
        );
      }

      throw error;
    }
  }

private readonly logger = new Logger(ProjectsService.name);

async addProjectImage(
  projectId: string,
  file: Express.Multer.File,
  dto: CreateProjectImageDto,
) {
  if (!file) {
    throw new BadRequestException(
      'An image file is required.',
    );
  }

  const project = await this.prisma.projects.findFirst({
    where: {
      id: projectId,
      deleted_at: null,
    },
    select: {
      id: true,
    },
  });

  if (!project) {
    throw new NotFoundException('Project not found.');
  }

  // Only one image is allowed per project.
  const existingImage =
    await this.prisma.project_images.findFirst({
      where: {
        project_id: projectId,
      },
      select: {
        id: true,
      },
    });

  if (existingImage) {
    throw new ConflictException(
      'This project already has an image. Delete the existing image before uploading another.',
    );
  }

  const uploadedImage = await this.mediaService.uploadImage(
    file,
    `ireg/projects/${projectId}`,
  );

  try {
    const image = await this.prisma.project_images.create({
      data: {
        project_id: projectId,
        image_url: uploadedImage.url,
        cloudinary_public_id: uploadedImage.publicId,
        display_order: dto.display_order ?? 0,
      },
    });

    return {
      message: 'Project image uploaded successfully.',
      data: image,
    };
  } catch (error) {
    try {
      await this.mediaService.deleteImage(
        uploadedImage.publicId,
      );
    } catch (cleanupError) {
      this.logger.error(
        `Failed to clean up Cloudinary image ${uploadedImage.publicId}.`,
        cleanupError instanceof Error
          ? cleanupError.stack
          : undefined,
      );
    }

    throw error;
  }
}

async replaceProjectImage(
  projectId: string,
  file: Express.Multer.File,
) {
  if (!file) {
    throw new BadRequestException('An image file is required.');
  }

  const project = await this.prisma.projects.findFirst({
    where: {
      id: projectId,
      deleted_at: null,
    },
    select: { id: true },
  });

  if (!project) {
    throw new NotFoundException('Project not found.');
  }

  const existingImage =
    await this.prisma.project_images.findFirst({
      where: { project_id: projectId },
    });

  if (!existingImage) {
    throw new NotFoundException(
      'This project does not have an image to replace. Use the POST endpoint to upload one.',
    );
  }

  // Upload the replacement before deleting the existing image.
  const uploadedImage = await this.mediaService.uploadImage(
    file,
    `ireg/projects/${projectId}`,
  );

  let updatedImage;

  try {
    updatedImage = await this.prisma.project_images.update({
      where: { id: existingImage.id },
      data: {
        image_url: uploadedImage.url,
        cloudinary_public_id: uploadedImage.publicId,
      },
    });
  } catch (error) {
    // The database update failed; clean up the new upload.
    try {
      await this.mediaService.deleteImage(uploadedImage.publicId);
    } catch (cleanupError) {
      this.logger.error(
        `Failed to clean up replacement image ${uploadedImage.publicId}.`,
        cleanupError instanceof Error
          ? cleanupError.stack
          : undefined,
      );
    }

    throw error;
  }

  // The database now references the new image.
  // Remove the old Cloudinary asset afterward.
  try {
    await this.mediaService.deleteImage(
      existingImage.cloudinary_public_id,
    );
  } catch (cleanupError) {
    this.logger.error(
      `Replacement succeeded, but the old Cloudinary image ${existingImage.cloudinary_public_id} could not be deleted.`,
      cleanupError instanceof Error
        ? cleanupError.stack
        : undefined,
    );
  }

  return {
    message: 'Project image replaced successfully.',
    data: updatedImage,
  };
}

async deleteProjectImage(projectId: string) {
  const project = await this.prisma.projects.findFirst({
    where: {
      id: projectId,
      deleted_at: null,
    },
    select: { id: true },
  });

  if (!project) {
    throw new NotFoundException('Project not found.');
  }

  const existingImage =
    await this.prisma.project_images.findFirst({
      where: { project_id: projectId },
    });

  if (!existingImage) {
    throw new NotFoundException(
      'No image found for this project.',
    );
  }

  // Delete the database record first.
  await this.prisma.project_images.delete({
    where: { id: existingImage.id },
  });

  // Then remove the asset from Cloudinary.
  try {
    await this.mediaService.deleteImage(
      existingImage.cloudinary_public_id,
    );
  } catch (error) {
    this.logger.error(
      `Image record was deleted, but Cloudinary cleanup failed for ${existingImage.cloudinary_public_id}.`,
      error instanceof Error ? error.stack : undefined,
    );

    throw new ServiceUnavailableException(
      'The image record was deleted, but the image could not be removed from Cloudinary. Please retry cleanup.',
    );
  }

  return {
    message: 'Project image deleted successfully.',
    project_id: projectId,
  };
}
}