import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { content_status } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { SearchTopicsDto } from './dto/search-topics.dto';

const topicInclude = {
  knowledge_categories: { select: { id: true, name: true, slug: true } },
  knowledge_topic_tags: {
    include: { knowledge_tags: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.knowledge_topicsInclude;

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.knowledge_categories.findMany({
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        display_order: true,
        knowledge_topics: {
          where: { status: content_status.PUBLISHED },
          select: { id: true, title: true, slug: true, level: true },
          orderBy: { title: 'asc' },
        },
      },
    });
  }

  async listTopicsInCategory(categorySlug: string) {
    const category = await this.prisma.knowledge_categories.findUnique({
      where: { slug: categorySlug },
      select: { id: true, name: true, slug: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    const topics = await this.prisma.knowledge_topics.findMany({
      where: { category_id: category.id, status: content_status.PUBLISHED },
      orderBy: [{ title: 'asc' }],
      select: { id: true, title: true, slug: true, level: true, simple_explanation: true },
    });
    return { category, topics };
  }

  async getTopic(slug: string) {
    const topic = await this.prisma.knowledge_topics.findFirst({
      where: { slug, status: content_status.PUBLISHED },
      include: topicInclude,
    });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  searchTopics(query: SearchTopicsDto) {
    return this.prisma.knowledge_topics.findMany({
      where: {
        status: content_status.PUBLISHED,
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { definition: { contains: query.q, mode: 'insensitive' } },
          { simple_explanation: { contains: query.q, mode: 'insensitive' } },
        ],
      },
      orderBy: { title: 'asc' },
      skip: query.offset,
      take: query.limit,
      include: topicInclude,
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    // 1. Normalize the category name
    const name = dto.name.trim();

    // 2. Generate a URL-friendly slug if one isn't provided
    const slug = (dto.slug?.trim() || name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // 3. Validate the generated slug
    if (!slug) {
      throw new ConflictException(
        'Unable to generate a valid slug for this category',
      );
    }

    if (slug.length > 220) {
      throw new ConflictException(
        'Category slug must not exceed 220 characters',
      );
    }

    // 4. Check whether a category with the same name already exists
    const existingCategory = await this.prisma.knowledge_categories.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (existingCategory) {
      throw new ConflictException(
        'A category with this name already exists',
      );
    }

    // 5. Create the category
    try {
      return await this.prisma.knowledge_categories.create({
        data: {
          name,
          slug,
          description: dto.description?.trim() || null,
          display_order: dto.display_order ?? 0,
        },
      });
    } catch (error) {
      // 6. Handle unique constraint violations
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A category with this slug already exists',
        );
      }

      throw error;
    }
  }

  // createTopic(dto: CreateTopicDto) {
  //   const { tag_ids = [], ...topic } = dto;
  //   return this.prisma.knowledge_topics.create({
  //     data: {
  //       ...topic,
  //       knowledge_topic_tags: tag_ids.length
  //         ? { create: tag_ids.map((tag_id) => ({ knowledge_tags: { connect: { id: tag_id } } })) }
  //         : undefined,
  //     },
  //     include: topicInclude,
  //   });
  // }

  async createTopic(dto: CreateTopicDto) {
    // 1. Verify that the category exists
    const category = await this.prisma.knowledge_categories.findUnique({
      where: {
        id: dto.category_id,
      },
    });

    if (!category) {
      throw new NotFoundException(
        `Knowledge category with ID ${dto.category_id} not found`,
      );
    }

    // 2. Generate slug from the title
    const slug = dto.title
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new BadRequestException(
        'A valid slug could not be generated from the topic title',
      );
    }

    // 3. Check for an existing topic with the same slug in this category
    const existingTopic = await this.prisma.knowledge_topics.findUnique({
      where: {
        category_id_slug: {
          category_id: dto.category_id,
          slug,
        },
      },
    });

    if (existingTopic) {
      throw new ConflictException(
        `A topic with the title "${dto.title}" already exists in this category`,
      );
    }

    // 4. Create the topic
    try {
      const topic = await this.prisma.knowledge_topics.create({
        data: {
          category_id: dto.category_id,
          title: dto.title.trim(),
          slug,
          level: dto.level,
          definition: dto.definition.trim(),
          simple_explanation: dto.simple_explanation?.trim() || null,
          status: dto.status ?? 'DRAFT',
        },
        include: {
          knowledge_categories: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return {
        success: true,
        message: 'Knowledge topic created successfully',
        data: topic,
      };
    } catch (error) {
      // Handle concurrent requests attempting to create the same topic
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A topic with this title already exists in this category',
        );
      }

      throw error;
    }
  }

  // async updateTopic(id: string, dto: UpdateTopicDto) {
  //   const { tag_ids, ...topic } = dto;
  //   return this.prisma.knowledge_topics.update({
  //     where: { id },
  //     data: {
  //       ...topic,
  //       ...(tag_ids === undefined ? {} : {
  //         knowledge_topic_tags: {
  //           deleteMany: {},
  //           ...(tag_ids.length ? { create: tag_ids.map((tag_id) => ({ knowledge_tags: { connect: { id: tag_id } } })) } : {}),
  //         },
  //       }),
  //       updated_at: new Date(),
  //     },
  //     include: topicInclude,
  //   });
  // }
  async updateTopic(id: string, dto: UpdateTopicDto) {
    // 1. Check whether the topic exists
    const existingTopic = await this.prisma.knowledge_topics.findUnique({
      where: { id },
    });

    if (!existingTopic) {
      throw new NotFoundException(
        `Knowledge topic with ID ${id} not found`,
      );
    }

    // 2. Determine the category after the update
    const categoryId = dto.category_id ?? existingTopic.category_id;

    // 3. Validate the category if it has changed
    if (
      dto.category_id !== undefined &&
      dto.category_id !== existingTopic.category_id
    ) {
      const category = await this.prisma.knowledge_categories.findUnique({
        where: { id: dto.category_id },
      });

      if (!category) {
        throw new NotFoundException(
          `Knowledge category with ID ${dto.category_id} not found`,
        );
      }
    }

    // 4. Determine the title and slug
    const title = dto.title?.trim() ?? existingTopic.title;

    let slug = existingTopic.slug;

    // Regenerate slug only when the title changes
    if (dto.title !== undefined && title !== existingTopic.title) {
      slug = title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (!slug) {
        throw new BadRequestException(
          'A valid slug could not be generated from the topic title',
        );
      }
    }

    // 5. Check for duplicate slug within the target category
    // This also handles category changes when the title remains unchanged.
    const duplicateTopic = await this.prisma.knowledge_topics.findFirst({
      where: {
        category_id: categoryId,
        slug,
        id: { not: id },
      },
      select: { id: true },
    });

    if (duplicateTopic) {
      throw new ConflictException(
        `A topic with the slug "${slug}" already exists in this category`,
      );
    }

    // 6. Prepare only the fields that need to be updated
    const data: Prisma.knowledge_topicsUpdateInput = {
      updated_at: new Date(),
    };

    if (dto.category_id !== undefined) {
      data.knowledge_categories = {
        connect: { id: categoryId },
      };
    }

    if (dto.title !== undefined) {
      data.title = title;
      data.slug = slug;
    }

    if (dto.level !== undefined) {
      data.level = dto.level;
    }

    if (dto.definition !== undefined) {
      data.definition = dto.definition.trim();
    }

    if (dto.simple_explanation !== undefined) {
      data.simple_explanation =
        dto.simple_explanation === null
          ? null
          : dto.simple_explanation.trim() || null;
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    // 7. Update the topic
    try {
      const updatedTopic = await this.prisma.knowledge_topics.update({
        where: { id },
        data,
        include: {
          knowledge_categories: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return {
        success: true,
        message: 'Knowledge topic updated successfully',
        data: updatedTopic,
      };
    } catch (error) {
      // Handle duplicate slugs if concurrent requests create a conflict
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A topic with this slug already exists in this category',
        );
      }

      throw error;
    }
  }

  // async publishTopic(id: string) {
  //   const topic = await this.prisma.knowledge_topics.findUnique({ where: { id }, select: { id: true } });
  //   if (!topic) throw new NotFoundException('Topic not found');
  //   return this.prisma.knowledge_topics.update({
  //     where: { id },
  //     data: { status: content_status.PUBLISHED, updated_at: new Date() },
  //     include: topicInclude,
  //   });
  // }
  async publishTopic(id: string) {
    // 1. Check whether the topic exists
    const topic = await this.prisma.knowledge_topics.findUnique({
      where: { id },
    });

    if (!topic) {
      throw new NotFoundException(
        `Knowledge topic with ID ${id} not found`,
      );
    }

    // 2. Publish the topic
    const publishedTopic = await this.prisma.knowledge_topics.update({
      where: { id },
      data: {
        status: content_status.PUBLISHED,
        updated_at: new Date(),
      },
      include: {
        knowledge_categories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // 3. Return the response
    return {
      success: true,
      message: 'Knowledge topic published successfully',
      data: publishedTopic,
    };
  }
}
