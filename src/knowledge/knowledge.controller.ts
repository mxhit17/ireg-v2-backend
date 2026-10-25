import { Controller, Get, Param, Query } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { SearchTopicsDto } from './dto/search-topics.dto';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('categories')
  listCategories() {
    return this.knowledgeService.listCategories();
  }

  @Get('categories/:slug/topics')
  listTopicsInCategory(@Param('slug') slug: string) {
    return this.knowledgeService.listTopicsInCategory(slug);
  }

  @Get('topics/search')
  searchTopics(@Query() query: SearchTopicsDto) {
    return this.knowledgeService.searchTopics(query);
  }

  @Get('topics/:slug')
  getTopic(@Param('slug') slug: string) {
    return this.knowledgeService.getTopic(slug);
  }
}
