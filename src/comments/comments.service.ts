import {
    ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListRepliesDto } from './dto/list-replies.dto';
import { EditCommentDto } from './dto/edit-comment.dto';
import { SetCommentReactionDto } from './dto/set-comment-reaction.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listReplies(
    commentId: string,
    query: ListRepliesDto,
  ) {
    const { page = 1, limit = 10, sortBy = 'oldest' } = query;

    // Verify that the parent comment exists and is not deleted.
    const parentComment = await this.prisma.comments.findFirst({
      where: {
        id: commentId,
        deleted_at: null,
      },
      select: {
        id: true,
      },
    });

    if (!parentComment) {
      throw new NotFoundException('Comment not found');
    }

    const where = {
      parent_comment_id: commentId,
      deleted_at: null,
    };

    const [replies, totalItems] = await this.prisma.$transaction([
      this.prisma.comments.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { created_at: sortBy === 'oldest' ? 'asc' : 'desc' },
          { id: sortBy === 'oldest' ? 'asc' : 'desc' },
        ],
        select: {
          id: true,
          project_id: true,
          parent_comment_id: true,
          content: true,
          created_at: true,
          updated_at: true,
          users: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              other_comments: {
                where: {
                  deleted_at: null,
                },
              },
            },
          },
        },
      }),
      this.prisma.comments.count({ where }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      message: 'Replies fetched successfully',
      data: replies.map(({ users, _count, ...reply }) => ({
        ...reply,
        user: users,
        replyCount: _count.other_comments,
      })),
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

  async editOwnComment(
    commentId: string,
    userId: string,
    dto: EditCommentDto,
  ) {
    const comment = await this.prisma.comments.findFirst({
      where: {
        id: commentId,
        user_id: userId,
        deleted_at: null,
      },
      select: {
        id: true,
      },
    });

    if (!comment) {
      throw new NotFoundException(
        'Comment not found',
      );
    }

    const updatedComment = await this.prisma.comments.update({
      where: {
        id: comment.id,
      },
      data: {
        content: dto.content.trim(),
        updated_at: new Date(),
      },
      select: {
        id: true,
        project_id: true,
        user_id: true,
        parent_comment_id: true,
        content: true,
        created_at: true,
        updated_at: true,
      },
    });

    return {
      message: 'Comment updated successfully',
      data: updatedComment,
    };
  }

  async deleteComment(
    commentId: string,
    userId: string,
    roles: string[],
  ) {
    const isAdmin = roles.includes('ADMIN');

    const comment = await this.prisma.comments.findFirst({
      where: {
        id: commentId,
        deleted_at: null,
      },
      select: {
        id: true,
        user_id: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const isOwner = comment.user_id === userId;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You are not authorized to delete this comment',
      );
    }

    // Soft-delete the comment and all its nested replies.
    await this.prisma.$executeRaw`
      WITH RECURSIVE comment_tree AS (
        SELECT id
        FROM comments
        WHERE id = ${commentId}::uuid

        UNION ALL

        SELECT c.id
        FROM comments c
        INNER JOIN comment_tree ct
          ON c.parent_comment_id = ct.id
      )
      UPDATE comments
      SET
        deleted_at = COALESCE(deleted_at, NOW()),
        updated_at = CASE
          WHEN deleted_at IS NULL THEN NOW()
          ELSE updated_at
        END
      WHERE id IN (SELECT id FROM comment_tree)
        AND deleted_at IS NULL
    `;

    return {
      message: 'Comment deleted successfully',
    };
  }

  async setCommentReaction(
    commentId: string,
    userId: string,
    dto: SetCommentReactionDto,
  ) {
    const comment = await this.prisma.comments.findFirst({
      where: {
        id: commentId,
        deleted_at: null,
      },
      select: {
        id: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (dto.reaction === null) {
      await this.prisma.comment_reactions.deleteMany({
        where: {
          comment_id: commentId,
          user_id: userId,
        },
      });

      return {
        message: 'Reaction cleared successfully',
        data: {
          commentId,
          reaction: null,
        },
      };
    }

    const reaction = await this.prisma.comment_reactions.upsert({
      where: {
        comment_id_user_id: {
          comment_id: commentId,
          user_id: userId,
        },
      },
      create: {
        comment_id: commentId,
        user_id: userId,
        reaction_type: dto.reaction,
      },
      update: {
        reaction_type: dto.reaction,
      },
      select: {
        id: true,
        comment_id: true,
        reaction_type: true,
        created_at: true,
      },
    });

    return {
      message: 'Reaction updated successfully',
      data: reaction,
    };
  }
}