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
import { GetProjectsDto } from './dto/get-project.dto';
import { project_ratings } from 'src/generated/prisma/client';
import { RateProjectDto } from './dto/rate-project.dto';
import { CreateProjectCommentDto } from './dto/create-project-comment.dto';
import { GetProjectCommentsDto } from './dto/get-project-comments.dto';
import { SearchProjectsDto } from './dto/search-project.dto';
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

  async rateProject(projectId: string, userId: string, dto: RateProjectDto) {
    const project = await this.prisma.projects.findFirst({
      where: { id: projectId, deleted_at: null },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const categoryCodes = Object.keys(dto) as Array<keyof RateProjectDto>;
    const categories = await this.prisma.rating_categories.findMany({
      where: { code: { in: categoryCodes }, is_active: true },
      select: { id: true, code: true },
    });

    if (categories.length !== 5) {
      throw new ServiceUnavailableException(
        'Project rating categories are not fully configured.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const ratings = await Promise.all(
        categories.map((category) =>
          tx.project_ratings.upsert({
            where: {
              project_id_user_id_rating_category_id: {
                project_id: projectId,
                user_id: userId,
                rating_category_id: category.id,
              },
            },
            create: {
              project_id: projectId,
              user_id: userId,
              rating_category_id: category.id,
              score: dto[category.code as keyof RateProjectDto],
            },
            update: {
              score: dto[category.code as keyof RateProjectDto],
              updated_at: new Date(),
            },
            include: {
              rating_categories: {
                select: { code: true, name: true },
              },
            },
          }),
        ),
      );

      return { project_id: projectId, ratings };
    });
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

  async getProjects(query: GetProjectsDto) {
    const {
      city,
      builderId,
      minPrice,
      maxPrice,
      type,
      sortBy = 'created_at',
      orderBy = 'desc',
      page = 1,
      limit = 10,
    } = query;

    // Validate the requested price range.
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException(
        'minPrice cannot be greater than maxPrice.',
      );
    }

    const skip = (page - 1) * limit;

    // Build filters dynamically.
    const where: Prisma.projectsWhereInput = {
      deleted_at: null,

      ...(city && {
        city: {
          equals: city.trim(),
          mode: 'insensitive',
        },
      }),

      ...(builderId && {
        builder_id: builderId,
      }),

      ...(type && {
        project_type: type,
      }),

      ...(minPrice !== undefined && {
        max_price: {
          gte: minPrice,
        },
      }),

      ...(maxPrice !== undefined && {
        min_price: {
          lte: maxPrice,
        },
      }),
    };

    // Only allow fields explicitly whitelisted in the DTO.
    const allowedSortFields = [
      'name',
      'min_price',
      'max_price',
      'created_at',
      'updated_at',
    ] as const;

    const safeSortBy = allowedSortFields.includes(
      sortBy as (typeof allowedSortFields)[number],
    )
      ? sortBy
      : 'created_at';

    const sortDirection: Prisma.SortOrder =
      orderBy === 'asc' ? 'asc' : 'desc';

    const orderByClause: Prisma.projectsOrderByWithRelationInput = {
      [safeSortBy]: sortDirection,
    };

    const [projects, total] = await Promise.all([
      this.prisma.projects.findMany({
        where,
        orderBy: [
          orderByClause,
          { id: 'asc' },
        ],
        skip,
        take: limit,
        include: {
          builders: {
            select: {
              id: true,
              name: true,
              logo_url: true,
            },
          },
          project_images: true,
        },
      }),

      this.prisma.projects.count({
        where,
      }),
    ]);

    return {
      message: 'Projects fetched successfully.',
      data: projects,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getProjectRatings(projectId: string) {
    // 1. Verify that the project exists and is not deleted.
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
      throw new NotFoundException('Project not found');
    }

    // 2. Fetch all active rating categories.
    const categories =
      await this.prisma.rating_categories.findMany({
        where: {
          is_active: true,
        },
        orderBy: {
          display_order: 'asc',
        },
        select: {
          id: true,
          code: true,
          name: true,
          display_order: true,
        },
      });

    // 3. Calculate average and count for every rated category.
    const ratingAggregates =
      await this.prisma.project_ratings.groupBy({
        by: ['rating_category_id'],
        where: {
          project_id: projectId,
        },
        _avg: {
          score: true,
        },
        _count: {
          _all: true,
        },
      });

    // 4. Create a lookup for efficient category matching.
    const aggregateMap = new Map(
      ratingAggregates.map((aggregate) => [
        aggregate.rating_category_id,
        aggregate,
      ]),
    );

    // 5. Include categories even when nobody has rated them.
    const categoryRatings = categories.map((category) => {
      const aggregate = aggregateMap.get(category.id);

      const average = aggregate?._avg.score;

      return {
        code: category.code,
        name: category.name,
        average_rating:
          average !== null && average !== undefined
            ? Math.round(Number(average) * 10) / 10
            : null,
        total_ratings: aggregate?._count._all ?? 0,
      };
    });

    // 6. Calculate overall average using categories that have ratings.
    const ratedCategories = categoryRatings.filter(
      (category) => category.average_rating !== null,
    );

    const overallRating =
      ratedCategories.length > 0
        ? Math.round(
            (ratedCategories.reduce(
              (sum, category) =>
                sum + category.average_rating!,
              0,
            ) /
              ratedCategories.length) *
              10,
          ) / 10
        : null;

    // 7. Return the response.
    return {
      project_id: project.id,
      overall_rating: overallRating,
      total_ratings: ratingAggregates.reduce(
        (sum, aggregate) =>
          sum + aggregate._count._all,
        0,
      ),
      categories: categoryRatings,
    };
  }

  async getMyProjectRatings(
    projectId: string,
    userId: string,
  ) {
    // Verify that the project exists and is not deleted.
    const project = await this.prisma.projects.findFirst({
      where: {
        id: projectId,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Fetch all rating categories.
    const categories =
      await this.prisma.rating_categories.findMany({
        orderBy: {
          display_order: 'asc',
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

    // Fetch only the authenticated user's ratings for this project.
    const userRatings =
      await this.prisma.project_ratings.findMany({
        where: {
          project_id: projectId,
          user_id: userId,
        },
        select: {
          rating_category_id: true,
          score: true,
        },
      });

    const ratingsMap = new Map(
      userRatings.map((rating) => [
        rating.rating_category_id,
        Number(rating.score),
      ]),
    );

    // Return all categories, even if the user hasn't rated one.
    const ratings = categories.map((category) => ({
      rating_category_id: category.id,
      code: category.code,
      category: category.name,
      score: ratingsMap.get(category.id) ?? null,
    }));

    const submittedScores = ratings
      .map((rating) => rating.score)
      .filter((score): score is number => score !== null);

    const overallRating =
      submittedScores.length > 0
        ? Math.round(
            (submittedScores.reduce(
              (sum, score) => sum + score,
              0,
            ) /
              submittedScores.length) *
              10,
          ) / 10
        : null;

    return {
      project_id: project.id,
      project_name: project.name,
      overall_rating: overallRating,
      categories_rated: submittedScores.length,
      total_categories: categories.length,
      ratings,
    };
  }

  async createProjectComment(
    projectId: string,
    userId: string,
    dto: CreateProjectCommentDto,
  ) {
    const content = dto.content.trim();

    if (!content) {
      throw new BadRequestException(
        'Comment content cannot be empty',
      );
    }

    // Verify that the project exists and is not deleted.
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
      throw new NotFoundException(
        'Project not found',
      );
    }

    // If this is a reply, verify the parent comment.
    if (dto.parentCommentId) {
      const parentComment = await this.prisma.comments.findFirst({
        where: {
          id: dto.parentCommentId,
          project_id: projectId,
          deleted_at: null,
        },
        select: {
          id: true,
        },
      });

      if (!parentComment) {
        throw new BadRequestException(
          'Parent comment does not exist for this project',
        );
      }
    }

    const comment = await this.prisma.comments.create({
      data: {
        project_id: projectId,
        user_id: userId,
        content,
        ...(dto.parentCommentId
          ? { parent_comment_id: dto.parentCommentId }
          : {}),
      },
      select: {
        id: true,
        project_id: true,
        user_id: true,
        parent_comment_id: true,
        content: true,
        created_at: true,
        updated_at: true,
      },
    });

    return {
      message: 'Comment created successfully',
      data: comment,
    };
  }

  async getProjectComments(
    projectId: string,
    query: GetProjectCommentsDto,
  ) {
    const { page = 1, limit = 10, sortBy = 'newest' } = query;

    const skip = (page - 1) * limit;

    // Check whether the project exists.
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
      throw new NotFoundException('Project not found');
    }

    const where = {
      project_id: projectId,
      parent_comment_id: null,
      deleted_at: null,
    };

    // Fetch comments and total count.
    const [comments, total] = await this.prisma.$transaction([
      this.prisma.comments.findMany({
        where,

        skip,
        take: limit,

        orderBy: {
          created_at: sortBy === 'newest' ? 'desc' : 'asc',
        },

        select: {
          id: true,
          project_id: true,
          user_id: true,
          content: true,
          created_at: true,
          updated_at: true,

          // Details of the user who posted the comment.
          users: {
            select: {
              id: true,
              name: true,
              // Add your profile image field here
              // if it exists in your users model.
            },
          },

          // Count non-deleted direct replies.
          _count: {
            select: {
              other_comments: {
                where: {
                  deleted_at: null,
                },
              },
            },
          },
        },
      }),

      this.prisma.comments.count({
        where,
      }),
    ]);

    const formattedComments = comments.map((comment) => ({
      id: comment.id,
      projectId: comment.project_id,
      userId: comment.user_id,
      content: comment.content,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,

      user: comment.users,

      replyCount: comment._count.other_comments,
    }));

    return {
      message: 'Project comments fetched successfully',

      data: formattedComments,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async saveProject(userId: string, projectId: string) {
    // 1. Check whether the project exists
    const project = await this.prisma.projects.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // 2. Save the project without creating duplicates
    await this.prisma.saved_projects.upsert({
      where: {
        user_id_project_id: {
          user_id: userId,
          project_id: projectId,
        },
      },
      create: {
        user_id: userId,
        project_id: projectId,
      },
      update: {},
    });

    // 3. Return response
    return {
      message: 'Project saved successfully',
      data: {
        project_id: projectId,
        saved: true,
      },
    };
  }

  async unsaveProject(userId: string, projectId: string) {
    const result = await this.prisma.saved_projects.deleteMany({
      where: {
        user_id: userId,
        project_id: projectId,
      },
    });

    return {
      message: result.count > 0
        ? 'Project unsaved successfully'
        : 'Project was not saved',
      data: {
        project_id: projectId,
        saved: false,
      },
    };
  }

  async searchProjects(dto: SearchProjectsDto) {
    const {
      q,
      city,
      state,
      locality,
      type,
      status,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
    } = dto;

    if (minPrice !== undefined &&
        maxPrice !== undefined &&
        minPrice > maxPrice) {
      throw new BadRequestException(
        'minPrice cannot be greater than maxPrice.',
      );
    }

    const where: Prisma.projectsWhereInput = {
      deleted_at: null,

      ...(q?.trim() && {
        OR: [
          { name: { contains: q.trim(), mode: 'insensitive' } },
          { slug: { contains: q.trim(), mode: 'insensitive' } },
          { location: { contains: q.trim(), mode: 'insensitive' } },
          { locality: { contains: q.trim(), mode: 'insensitive' } },
          { city: { contains: q.trim(), mode: 'insensitive' } },
          { state: { contains: q.trim(), mode: 'insensitive' } },
        ],
      }),

      ...(city?.trim() && {
        city: { equals: city.trim(), mode: 'insensitive' },
      }),

      ...(state?.trim() && {
        state: { equals: state.trim(), mode: 'insensitive' },
      }),

      ...(locality?.trim() && {
        locality: { equals: locality.trim(), mode: 'insensitive' },
      }),

      ...(type && { project_type: type }),

      ...(status && { status }),

      ...(minPrice !== undefined && {
        max_price: { gte: new Prisma.Decimal(minPrice) },
      }),

      ...(maxPrice !== undefined && {
        min_price: { lte: new Prisma.Decimal(maxPrice) },
      }),
    };

    const skip = (page - 1) * limit;

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.projects.findMany({
        where,
        orderBy: [
          { created_at: 'desc' },
          { id: 'desc' },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          project_type: true,
          status: true,
          location: true,
          locality: true,
          city: true,
          state: true,
          country: true,
          latitude: true,
          longitude: true,
          min_price: true,
          max_price: true,
          currency: true,
          created_at: true,
          project_images: {
            select: {
              id: true,
              image_url: true,
            },
          },
        },
      }),

      this.prisma.projects.count({ where }),
    ]);

    return {
      success: true,
      message: 'Projects fetched successfully',
      data: projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  // Situation	          userId	              visitorId
  // Guest user	          null	                Persistent installation UUID
  // Authenticated user	  Extracted from JWT	  Same persistent installation UUID
  // User logs out	      null	                Keep the same UUID
  // User logs in again	  Extracted from JWT	  Keep the same UUID
  async recordProjectView(
    projectId: string,
    userId: string | null,
    visitorId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize simultaneous requests for this project/visitor pair.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${projectId} || ':' || ${visitorId},
            0
          )
        )
      `;

      const project = await tx.projects.findUnique({
        where: { id: projectId },
        select: { id: true },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Do not record another view within the last 30 minutes.
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO project_view_events (
          project_id,
          user_id,
          visitor_id
        )
        SELECT
          p.id,
          ${userId}::uuid,
          ${visitorId}::uuid
        FROM projects p
        WHERE p.id = ${projectId}::uuid
          AND NOT EXISTS (
            SELECT 1
            FROM project_view_events e
            WHERE e.project_id = p.id
              AND e.visitor_id = ${visitorId}::uuid
              AND e.viewed_at >= NOW() - INTERVAL '30 minutes'
          )
        RETURNING id
      `;

      return inserted.length > 0;
    });
  }
}
