import { Injectable, NotFoundException } from '@nestjs/common';
import { content_status } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';

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
  constructor(private readonly prisma: PrismaService) {}

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

  createBlog(dto: CreateBlogDto, authorId: string) {
    return this.prisma.blogs.create({
      data: { ...dto, author_id: authorId },
      select: blogSelect,
    });
  }

  async updateBlog(id: string, dto: UpdateBlogDto) {
    await this.ensureActiveBlog(id);
    return this.prisma.blogs.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
      select: blogSelect,
    });
  }

  async publishBlog(id: string) {
    await this.ensureActiveBlog(id);
    return this.prisma.blogs.update({
      where: { id },
      data: { status: content_status.PUBLISHED, published_at: new Date(), updated_at: new Date() },
      select: blogSelect,
    });
  }

  async archiveBlog(id: string) {
    await this.ensureActiveBlog(id);
    return this.prisma.blogs.update({
      where: { id },
      data: { status: content_status.ARCHIVED, deleted_at: new Date(), updated_at: new Date() },
      select: blogSelect,
    });
  }

  private async ensureActiveBlog(id: string) {
    const blog = await this.prisma.blogs.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
    if (!blog) throw new NotFoundException('Blog not found');
  }
}
