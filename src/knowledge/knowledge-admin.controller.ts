import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { KnowledgeService } from './knowledge.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('admin/knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KnowledgeAdminController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.knowledgeService.createCategory(dto);
  }

  @Post('topics')
  @HttpCode(HttpStatus.CREATED)
  createTopic(@Body() dto: CreateTopicDto) {
    return this.knowledgeService.createTopic(dto);
  }

  @Patch('topics/:id')
  updateTopic(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateTopicDto) {
    return this.knowledgeService.updateTopic(id, dto);
  }

  @Post('topics/:id/publish')
  publishTopic(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.knowledgeService.publishTopic(id);
  }
}
