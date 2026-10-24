import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PopularityService {
  private readonly logger = new Logger(PopularityService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES, {
    name: 'refresh-project-popularity',
    waitForCompletion: true,
  })
  async refreshPopularity(): Promise<void> {
    this.logger.log('Starting project popularity refresh');

    try {
      await this.prisma.$executeRaw`
        DO $refresh$
        BEGIN
          PERFORM refresh_project_stats();
        END
        $refresh$;
      `;

      this.logger.log('Project popularity refresh completed');
    } catch (error) {
      this.logger.error(
        'Project popularity refresh failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  

  async getPopularProjects(
    limit: number,
    offset: number,
    excludeProjectIds: string[] = [],
  ): Promise<Record<string, unknown>[]> {
    const exclusion = excludeProjectIds.length
      ? Prisma.sql`AND p.id NOT IN (${Prisma.join(excludeProjectIds)})`
      : Prisma.empty;
    const projects = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        p.id,
        p.name,
        p.slug,
        p.project_type,
        p.status,
        p.location,
        p.locality,
        p.city,
        p.state,
        p.min_price::DOUBLE PRECISION AS min_price,
        p.max_price::DOUBLE PRECISION AS max_price,
        b.name AS builder_name,

        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', pi.id,
              'imageUrl', pi.image_url,
              'displayOrder', pi.display_order
            )
            ORDER BY pi.display_order
          ) FILTER (WHERE pi.id IS NOT NULL),
          '[]'::jsonb
        ) AS images,

        ps.popularity_score::DOUBLE PRECISION AS popularity_score,
        ps.trending_score::DOUBLE PRECISION AS trending_score,
        ps.views_30d,
        ps.unique_visitors_30d,
        ps.saves_30d,
        ps.comments_30d,
        ps.rating_activity_30d,
        ps.calculated_at

      FROM projects p

      JOIN project_stats ps
        ON ps.project_id = p.id

      JOIN builders b
        ON b.id = p.builder_id

      LEFT JOIN project_images pi
        ON pi.project_id = p.id

      WHERE p.deleted_at IS NULL
        ${exclusion}

      GROUP BY p.id, b.id, ps.project_id

      ORDER BY
        ps.popularity_score DESC,
        ps.calculated_at DESC,
        p.id ASC

      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return serializeBigInts(projects);
  }

  async countPopularProjects(excludeProjectIds: string[] = []): Promise<number> {
    const exclusion = excludeProjectIds.length
      ? Prisma.sql`AND p.id NOT IN (${Prisma.join(excludeProjectIds)})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::BIGINT AS total
      FROM projects p
      JOIN project_stats ps ON ps.project_id = p.id
      WHERE p.deleted_at IS NULL
        ${exclusion}
    `;

    return Number(rows[0]?.total ?? 0);
  }
}

function serializeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') {
    return (
      Number.isSafeInteger(Number(value))
        ? Number(value)
        : value.toString()
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map(serializeBigInts) as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = serializeBigInts(item);
    }

    return result as T;
  }

  return value;
}
