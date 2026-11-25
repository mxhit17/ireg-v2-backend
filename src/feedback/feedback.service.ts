import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ListFeedbackDto } from './dto/list-feedback.dto';

/** A user can send feedback again, but not more than once per this window. */
const SUBMIT_COOLDOWN_MS = 60 * 1000;

const feedbackSelect = {
  id: true,
  rating: true,
  message: true,
  created_at: true,
} satisfies Prisma.feedbackSelect;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async createFeedback(userId: string, dto: CreateFeedbackDto) {
    const latest = await this.prisma.feedback.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });

    if (
      latest &&
      Date.now() - latest.created_at.getTime() < SUBMIT_COOLDOWN_MS
    ) {
      throw new HttpException(
        'You just sent feedback. Please wait a minute before sending more.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const message = dto.message?.trim() || null;

    const feedback = await this.prisma.feedback.create({
      data: {
        user_id: userId,
        rating: dto.rating,
        message,
      },
      select: feedbackSelect,
    });

    return {
      message: 'Thank you for your feedback',
      data: feedback,
    };
  }

  /** The signed-in user's most recent feedback (null if they've never sent any). */
  async getMyLatestFeedback(userId: string) {
    const [latest, totalSubmitted] = await this.prisma.$transaction([
      this.prisma.feedback.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: feedbackSelect,
      }),
      this.prisma.feedback.count({ where: { user_id: userId } }),
    ]);

    return {
      message: 'Feedback fetched successfully',
      data: latest,
      totalSubmitted,
    };
  }

  /** Admin: paginated responses (filterable) + summary over ALL feedback. */
  async listFeedback(query: ListFeedbackDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'newest',
      minRating,
      maxRating,
      hasMessage,
    } = query;

    if (
      minRating !== undefined &&
      maxRating !== undefined &&
      minRating > maxRating
    ) {
      throw new BadRequestException(
        'minRating cannot be greater than maxRating',
      );
    }

    const where: Prisma.feedbackWhereInput = {};
    if (minRating !== undefined || maxRating !== undefined) {
      where.rating = {
        ...(minRating !== undefined && { gte: minRating }),
        ...(maxRating !== undefined && { lte: maxRating }),
      };
    }
    if (hasMessage === true) where.message = { not: null };
    if (hasMessage === false) where.message = null;

    const direction = sortBy === 'oldest' ? 'asc' : 'desc';

    const [items, totalItems, aggregate, grouped] =
      await this.prisma.$transaction([
        this.prisma.feedback.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ created_at: direction }, { id: direction }],
          select: {
            ...feedbackSelect,
            users: {
              select: {
                id: true,
                name: true,
                email: true,
                profile_image_url: true,
              },
            },
          },
        }),
        this.prisma.feedback.count({ where }),
        this.prisma.feedback.aggregate({
          _avg: { rating: true },
          _count: { _all: true },
        }),
        this.prisma.feedback.groupBy({
          by: ['rating'],
          orderBy: { rating: 'asc' },
          _count: { _all: true },
        }),
      ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      message: 'Feedback fetched successfully',
      data: items.map(({ users, ...item }) => ({ ...item, user: users })),
      summary: this.buildSummary(
        aggregate._count._all,
        aggregate._avg.rating,
        grouped.map((g) => ({
          rating: g.rating,
          count: (g._count as { _all: number })._all,
        })),
      ),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * NPS-style buckets on the 1–10 scale: promoters 9–10, passives 7–8, detractors 1–6.
   * npsScore = %promoters − %detractors (−100 … 100), null when there's no feedback.
   */
  private buildSummary(
    totalResponses: number,
    avg: number | null,
    counts: { rating: number; count: number }[],
  ) {
    const distribution: Record<string, number> = {};
    for (let r = 1; r <= 10; r++) distribution[r] = 0;
    for (const { rating, count } of counts) distribution[rating] = count;

    const sum = (from: number, to: number) => {
      let total = 0;
      for (let r = from; r <= to; r++) total += distribution[r];
      return total;
    };

    const promoters = sum(9, 10);
    const passives = sum(7, 8);
    const detractors = sum(1, 6);

    return {
      totalResponses,
      averageRating: avg === null ? null : Math.round(avg * 10) / 10,
      npsScore:
        totalResponses === 0
          ? null
          : Math.round(((promoters - detractors) / totalResponses) * 100),
      promoters,
      passives,
      detractors,
      distribution,
    };
  }
}
