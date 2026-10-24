import { Controller, Get, Query } from '@nestjs/common';
import { PopularProjectsQueryDto } from './dto/popular-project-query.dto';
import { PopularityService } from './popularity.service';

@Controller('popularity')
export class PopularityController {
    constructor (private readonly popularityService : PopularityService) {}

    @Get('popular')
  async getPopularProjects(
    @Query() query: PopularProjectsQueryDto,
  ) {
    const data = await this.popularityService.getPopularProjects(
      query.limit,
      query.offset,
    );

    return {
      success: true,
      data,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        count: data.length,
      },
    };
  }
}
