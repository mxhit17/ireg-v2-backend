import { Controller, Get, Param } from '@nestjs/common';
import { BlogsService } from './blogs.service';

@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Get()
  listPublishedBlogs() {
    return this.blogsService.listPublishedBlogs();
  }

  @Get(':slug')
  getPublishedBlog(@Param('slug') slug: string) {
    return this.blogsService.getPublishedBlog(slug);
  }
}
