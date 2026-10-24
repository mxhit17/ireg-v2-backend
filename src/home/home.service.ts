import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PopularityService } from '../popularity/popularity.service';
import { GetHomeDto } from './dto/get-home.dto';

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly popularityService: PopularityService,
  ) {}

  async getHome(userId: string | undefined, query: GetHomeDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const saved = userId
      ? await this.prisma.saved_projects.findMany({
          where: { user_id: userId },
          select: { project_id: true },
        })
      : [];
    const savedProjectIds = saved.map((project) => project.project_id);
    const recentWhere = {
      deleted_at: null,
      ...(savedProjectIds.length > 0 && {
        id: { notIn: savedProjectIds },
      }),
    };

    const [recentProjects, recentTotal] = await Promise.all([
        this.prisma.projects.findMany({
          where: recentWhere,
          orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
          skip,
          take: limit,
          include: {
            builders: { select: { id: true, name: true, logo_url: true } },
            project_images: true,
          },
        }),
        this.prisma.projects.count({ where: recentWhere }),
      ]);
    const excludedFromPopular = [
      ...savedProjectIds,
      ...recentProjects.map((project) => project.id),
    ];
    const [popularProjects, popularTotal] = await Promise.all([
      this.popularityService.getPopularProjects(limit, skip, excludedFromPopular),
      this.popularityService.countPopularProjects(excludedFromPopular),
    ]);

    const pagination = (total: number) => ({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    });

    return {
      success: true,
      data: {
        recentProjects,
        popularProjects,
        savedProjectIds,
      },
      pagination: {
        recentProjects: pagination(recentTotal),
        popularProjects: pagination(popularTotal),
      },
    };
  }
}
