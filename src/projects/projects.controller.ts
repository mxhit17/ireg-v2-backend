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
  Query,
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

  // GET /projects?page=1&limit=20
  @Get()
  @HttpCode(HttpStatus.OK)
  getAllProjects(@Query() query: PaginationDto) {
    return this.projectsService.getAllProjects(query);
  }

  // GET /projects/:id
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
}