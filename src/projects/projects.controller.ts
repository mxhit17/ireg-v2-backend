import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { PaginationDto } from 'src/common/pagination/pagination.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateProjectImageDto } from './dto/create-project-image.dto';
import { GetProjectsDto } from './dto/get-project.dto';
import { RateProjectDto } from './dto/rate-project.dto';
import { CreateProjectCommentDto } from './dto/create-project-comment.dto';
import { GetProjectCommentsDto } from './dto/get-project-comments.dto';
import { SearchProjectsDto } from './dto/search-project.dto';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.gaurd';
import { RecordProjectViewDto } from './dto/record-project-view.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createProject(@Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(dto);
  }

  // // GET /projects?page=1&limit=20
  // @Get()
  // @HttpCode(HttpStatus.OK)
  // getAllProjects(@Query() query: PaginationDto) {
  //   return this.projectsService.getAllProjects(query);
  // }

  // GET /projects/:id
  @Post(':id/ratings')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  rateProject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RateProjectDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectsService.rateProject(id, request.user.id, dto);
  }

  @Get('search')
  searchProjects(@Query() dto: SearchProjectsDto) {
    return this.projectsService.searchProjects(dto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getProjectById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.projectsService.getProjectById(id);
  }

  // DELETE /projects/:id
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deleteProject(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.projectsService.deleteProject(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  updateProject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.updateProject(id, dto);
  }

  @Post(':projectId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  addProjectImage(
    @Param('projectId', new ParseUUIDPipe())
    projectId: string,

    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 5 * 1024 * 1024, // 5 MB
          }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,

    @Body() dto: CreateProjectImageDto,
  ) {
    return this.projectsService.addProjectImage(
      projectId,
      file,
      dto,
    );
  }

  @Patch(':projectId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  replaceProjectImage(
    @Param('projectId', new ParseUUIDPipe())
    projectId: string,

    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 5 * 1024 * 1024,
          }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.projectsService.replaceProjectImage(
      projectId,
      file,
    );
  }

  @Delete(':projectId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deleteProjectImage(
    @Param('projectId', new ParseUUIDPipe())
    projectId: string,
  ) {
    return this.projectsService.deleteProjectImage(projectId);
  }

  // This api can replace getAllProjects Api just dont pass any parameters
  @Get()
  getProjects(@Query() query: GetProjectsDto) {
    return this.projectsService.getProjects(query);
  }

  @Get(':projectId/ratings')
  async getProjectRatings(
    @Param('projectId', ParseUUIDPipe)
    projectId: string,
  ) {
    return this.projectsService.getProjectRatings(
      projectId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':projectId/my-rating')
  async getMyProjectRatings(
    @Param('projectId', ParseUUIDPipe)
    projectId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.getMyProjectRatings(
      projectId,
      req.user.id,
    );
  }

  @Post(':projectId/comments')
  @UseGuards(JwtAuthGuard)
  async createProjectComment(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateProjectCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.createProjectComment(
      projectId,
      req.user.id,
      dto,
    );
  }

  @Get(':projectId/comments')
  async getProjectComments(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: GetProjectCommentsDto,
  ) {
    return this.projectsService.getProjectComments(
      projectId,
      query,
    );
  }

  @Put(':id/save')
  @UseGuards(JwtAuthGuard)
  async saveProject(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.saveProject(
      req.user.id,
      projectId,
    );
  }

  @Delete(':id/save')
  @UseGuards(JwtAuthGuard)
  async unsaveProject(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.unsaveProject(
      req.user.id,
      projectId,
    );
  }

  @Post(':id/view')
  @UseGuards(OptionalJwtAuthGuard)
  async recordProjectView(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: RecordProjectViewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id ?? null;

    const recorded =
      await this.projectsService.recordProjectView(
        projectId,
        userId,
        dto.visitorId,
      );

    return {
      success: true,
      recorded,
      message: recorded
        ? 'Project view recorded'
        : 'Project view already recorded recently',
    };
  }
}
