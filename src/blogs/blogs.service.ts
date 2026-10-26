import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { content_status } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { MediaService } from 'src/media/media.service';
import { Prisma } from '../generated/prisma/client';

const blogSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  body: true,
  cover_image_url: true,
  source_name: true,
  source_url: true,
  published_at: true,
  created_at: true,
  updated_at: true,
  users: { select: { id: true, name: true, profile_image_url: true } },
};

@Injectable()
export class BlogsService {
  constructor(private readonly prisma: PrismaService, private readonly mediaService: MediaService) {}
  private readonly logger = new Logger(BlogsService.name);

  listPublishedBlogs() {
    return this.prisma.blogs.findMany({
      where: { status: content_status.PUBLISHED, deleted_at: null },
      orderBy: [{ published_at: 'desc' }, { created_at: 'desc' }],
      select: blogSelect,
    });
  }

  async getPublishedBlog(slug: string) {
    const blog = await this.prisma.blogs.findFirst({
      where: { slug, status: content_status.PUBLISHED, deleted_at: null },
      select: blogSelect,
    });
    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }

  // createBlog(dto: CreateBlogDto, authorId: string) {
  //   return this.prisma.blogs.create({
  //     data: { ...dto, author_id: authorId },
  //     select: blogSelect,
  //   });
  // }

  async createBlog(
    dto: CreateBlogDto,
    authorId: string,
    file?: Express.Multer.File,
  ) {
    let uploadedPublicId: string | null = null;

    try {
      // 1. Validate the incoming data.
      const title = dto.title.trim();
      const body = dto.body.trim();

      if (!title || !body) {
        throw new BadRequestException(
          'Blog title and body cannot be empty.',
        );
      }

      // 2. Generate a URL-friendly slug from the title.
      const baseSlug = this.generateSlug(title);

      if (!baseSlug) {
        throw new BadRequestException(
          'Unable to generate a slug from the blog title.',
        );
      }

      // 3. Ensure the slug is unique.
      // Include soft-deleted blogs in this check because the slug
      // column has a database-wide unique constraint.
      let slug = baseSlug;
      let suffix = 1;

      while (
        await this.prisma.blogs.findUnique({
          where: { slug },
          select: { id: true },
        })
      ) {
        slug = `${baseSlug}-${suffix}`;
        suffix++;
      }

      // 4. Upload the cover image using the existing MediaService.
      let coverImageUrl: string | null = null;

      if (file) {
        const uploadResult = await this.mediaService.uploadImage(
          file,
          'ireg/blog_covers',
        );

        coverImageUrl = uploadResult.url;
        uploadedPublicId = uploadResult.publicId;

        if (!coverImageUrl || !uploadedPublicId) {
          throw new Error(
            'Cloudinary did not return the image URL and public ID.',
          );
        }
      }

      // 5. Create the blog in PostgreSQL.
      const blog = await this.prisma.blogs.create({
        data: {
          author_id: authorId,
          title,
          slug,
          excerpt: dto.excerpt?.trim() || null,
          body,
          source_name: dto.source_name?.trim() || null,
          source_url: dto.source_url?.trim() || null,

          cover_image_url: coverImageUrl,
          cover_image_public_id: uploadedPublicId,

          // status defaults to DRAFT in your Prisma schema.
          // published_at and deleted_at remain null.
        },
        select: {
          id: true,
          author_id: true,
          title: true,
          slug: true,
          excerpt: true,
          body: true,
          cover_image_url: true,
          source_name: true,
          source_url: true,
          status: true,
          published_at: true,
          created_at: true,
          updated_at: true,
        },
      });

      // 6. Return the created blog.
      return {
        success: true,
        message: 'Blog created successfully.',
        data: blog,
      };
    } catch (error) {
      // 7. If the upload succeeded but blog creation failed,
      // delete the uploaded image to avoid orphaned Cloudinary assets.
      if (uploadedPublicId) {
        try {
          await this.mediaService.deleteImage(uploadedPublicId);
        } catch (cleanupError) {
          // Preserve the original error. Log cleanup failures so
          // orphaned Cloudinary assets can be investigated.
          console.error(
            'Failed to clean up uploaded blog cover image:',
            cleanupError,
          );
        }
      }

      // Preserve NestJS HTTP exceptions.
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      throw error;
    }
  }

  private generateSlug(title: string): string {
    return title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 300)
      .replace(/-+$/g, '');
  }

  // async updateBlog(id: string, dto: UpdateBlogDto) {
  //   await this.ensureActiveBlog(id);
  //   return this.prisma.blogs.update({
  //     where: { id },
  //     data: { ...dto, updated_at: new Date() },
  //     select: blogSelect,
  //   });
  // }

  async updateBlog(
    id: string,
    dto: UpdateBlogDto,
    file?: Express.Multer.File,
  ) {
    let newImagePublicId: string | null = null;

    try {
      // 1. Find the existing blog.
      const existingBlog = await this.prisma.blogs.findFirst({
        where: {
          id,
          deleted_at: null,
        },
      });

      if (!existingBlog) {
        throw new NotFoundException(
          'Blog not found.',
        );
      }

      // 2. Prepare only the fields provided in the request.
      const data: Prisma.blogsUncheckedUpdateInput = {
        updated_at: new Date(),
      };

      if (dto.title !== undefined) {
        const title = dto.title.trim();

        if (!title) {
          throw new BadRequestException(
            'Blog title cannot be empty.',
          );
        }

        data.title = title;

        // Regenerate the slug only if the title changes.
        if (title !== existingBlog.title) {
          const baseSlug = this.generateSlug(title);

          if (!baseSlug) {
            throw new BadRequestException(
              'Unable to generate a slug from the blog title.',
            );
          }

          data.slug = await this.generateUniqueSlug(
            baseSlug,
            id,
          );
        }
      }

      if (dto.body !== undefined) {
        const body = dto.body.trim();

        if (!body) {
          throw new BadRequestException(
            'Blog body cannot be empty.',
          );
        }

        data.body = body;
      }

      if (dto.excerpt !== undefined) {
        data.excerpt = dto.excerpt?.trim() || null;
      }

      if (dto.source_name !== undefined) {
        data.source_name = dto.source_name?.trim() || null;
      }

      if (dto.source_url !== undefined) {
        data.source_url = dto.source_url;
      }

      // 3. Upload the new image if one was provided.
      if (file) {
        const uploadResult = await this.mediaService.uploadImage(
          file,
          'ireg/blog_covers',
        );

        newImagePublicId = uploadResult.publicId;

        if (!uploadResult.url || !newImagePublicId) {
          throw new Error(
            'Cloudinary did not return the image URL and public ID.',
          );
        }

        data.cover_image_url = uploadResult.url;
        data.cover_image_public_id = newImagePublicId;
      }

      // 4. Update the database.
      const updatedBlog = await this.prisma.blogs.update({
        where: {
          id,
        },
        data,
        select: {
          id: true,
          author_id: true,
          title: true,
          slug: true,
          excerpt: true,
          body: true,
          cover_image_url: true,
          source_name: true,
          source_url: true,
          status: true,
          published_at: true,
          created_at: true,
          updated_at: true,
        },
      });

      // 5. Database update succeeded.
      // Delete the old image only after the new image is saved.
      if (
        file &&
        existingBlog.cover_image_public_id &&
        existingBlog.cover_image_public_id !== newImagePublicId
      ) {
        try {
          await this.mediaService.deleteImage(
            existingBlog.cover_image_public_id,
          );
        } catch (cleanupError) {
          // The database now references the new image.
          // Log the failure so the old image can be cleaned up later.
          console.error(
            'Failed to delete the old blog cover image:',
            cleanupError,
          );
        }
      }

      return {
        success: true,
        message: 'Blog updated successfully.',
        data: updatedBlog,
      };
    } catch (error) {
      // 6. If uploading succeeded but the database update failed,
      // remove the newly uploaded image.
      if (newImagePublicId) {
        try {
          await this.mediaService.deleteImage(
            newImagePublicId,
          );
        } catch (cleanupError) {
          console.error(
            'Failed to clean up the newly uploaded blog cover image:',
            cleanupError,
          );
        }
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // Handle duplicate slug errors caused by concurrent requests.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A blog with the generated slug already exists. Please try again.',
        );
      }

      throw error;
    }
  }

  private async generateUniqueSlug(
    baseSlug: string,
    currentBlogId: string,
  ): Promise<string> {
    let slug = baseSlug;
    let suffix = 1;

    while (true) {
      const existingBlog = await this.prisma.blogs.findUnique({
        where: {
          slug,
        },
        select: {
          id: true,
        },
      });

      // The current blog is allowed to retain its own slug.
      if (
        !existingBlog ||
        existingBlog.id === currentBlogId
      ) {
        return slug;
      }

      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }
  }

  // async publishBlog(id: string) {
  //   await this.ensureActiveBlog(id);
  //   return this.prisma.blogs.update({
  //     where: { id },
  //     data: { status: content_status.PUBLISHED, published_at: new Date(), updated_at: new Date() },
  //     select: blogSelect,
  //   });
  // }

  async publishBlog(id: string) {
    // 1. Find the blog and ensure it hasn't been deleted.
    const blog = await this.prisma.blogs.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        published_at: true,
      },
    });

    // 2. Ensure the blog exists.
    if (!blog) {
      throw new NotFoundException(
        'Blog not found or has been deleted.',
      );
    }

    // 3. Prevent publishing an already-published blog.
    if (blog.status === 'PUBLISHED') {
      throw new BadRequestException(
        'This blog has already been published.',
      );
    }

    // 4. Publish the blog.
    const publishedBlog = await this.prisma.blogs.update({
      where: {
        id: blog.id,
      },
      data: {
        status: 'PUBLISHED',
        published_at: new Date(),
        updated_at: new Date(),
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        body: true,
        cover_image_url: true,
        source_name: true,
        source_url: true,
        status: true,
        published_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    // 5. Return the published blog.
    return {
      message: 'Blog published successfully.',
      blog: publishedBlog,
    };
  }

  // async archiveBlog(id: string) {
  //   await this.ensureActiveBlog(id);
  //   return this.prisma.blogs.update({
  //     where: { id },
  //     data: { status: content_status.ARCHIVED, deleted_at: new Date(), updated_at: new Date() },
  //     select: blogSelect,
  //   });
  // }

  // private async ensureActiveBlog(id: string) {
  //   const blog = await this.prisma.blogs.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
  //   if (!blog) throw new NotFoundException('Blog not found');
  // }
  
  async archiveBlog(id: string) {
    // 1. Find the existing blog.
    const existingBlog = await this.prisma.blogs.findFirst({
      where: {
        id,
        deleted_at: null,
      },
    });

    if (!existingBlog) {
      throw new NotFoundException('Blog not found.');
    }

    // 2. Archive the blog in the database.
    const archivedBlog = await this.prisma.blogs.update({
      where: {
        id: existingBlog.id,
      },
      data: {
        deleted_at: new Date(),
      },
      select: {
        id: true,
        title: true,
        deleted_at: true,
        cover_image_public_id: true,
      },
    });

    // 3. Delete the cover image from Cloudinary if one exists.
    if (existingBlog.cover_image_public_id) {
      try {
        await this.mediaService.deleteImage(
          existingBlog.cover_image_public_id,
        );
      } catch (error) {
        // The blog is already archived, so do not report the entire
        // operation as failed just because Cloudinary cleanup failed.
        this.logger.error(
          `Blog ${id} was archived, but its Cloudinary image could not be deleted. Public ID: ${existingBlog.cover_image_public_id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // 4. Return the result.
    return {
      message: 'Blog archived successfully.',
      blog: {
        id: archivedBlog.id,
        title: archivedBlog.title,
        deleted_at: archivedBlog.deleted_at,
      },
    };
  }
}
