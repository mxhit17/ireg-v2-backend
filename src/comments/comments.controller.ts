import {
    Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { ListRepliesDto } from './dto/list-replies.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { EditCommentDto } from './dto/edit-comment.dto';
import { SetCommentReactionDto } from './dto/set-comment-reaction.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

@Controller('comments')
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
  ) {}

  @Get(':commentId/replies')
  async listReplies(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Query() query: ListRepliesDto,
  ) {
    return this.commentsService.listReplies(
      commentId,
      query,
    );
  }

  @Patch(':commentId')
@UseGuards(JwtAuthGuard)
async editOwnComment(
  @Param('commentId', ParseUUIDPipe) commentId: string,
  @Body() dto: EditCommentDto,
  @Req() req: AuthenticatedRequest,
) {
  return this.commentsService.editOwnComment(
    commentId,
    req.user.id,
    dto,
  );
}

@Delete(':id')
@UseGuards(JwtAuthGuard)
async deleteComment(
  @Param('id', ParseUUIDPipe) id: string,
  @Req() req: AuthenticatedRequest,
) {
  return this.commentsService.deleteComment(
    id,
    req.user.id,
    req.user.roles,
  );
}

@Put(':id/reaction')
@UseGuards(JwtAuthGuard)
async setCommentReaction(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: SetCommentReactionDto,
  @Req() req: AuthenticatedRequest,
) {
  return this.commentsService.setCommentReaction(
    id,
    req.user.id,
    dto,
  );
}
}