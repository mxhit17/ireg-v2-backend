import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('admin/blogs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminBlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBlog(@Body() dto: CreateBlogDto, @Req() request: AuthenticatedRequest) {
    return this.blogsService.createBlog(dto, request.user.id);
  }

  @Patch(':id')
  updateBlog(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBlogDto) {
    return this.blogsService.updateBlog(id, dto);
  }

  @Post(':id/publish')
  publishBlog(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.blogsService.publishBlog(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  archiveBlog(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.blogsService.archiveBlog(id);
  }
}
