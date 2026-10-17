import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class EditCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}