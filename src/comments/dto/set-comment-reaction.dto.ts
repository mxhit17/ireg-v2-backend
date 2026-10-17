import { IsIn } from 'class-validator';

export class SetCommentReactionDto {
  @IsIn(['LIKE', 'DISLIKE', null])
  reaction!: 'LIKE' | 'DISLIKE' | null;
}