import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

export class CreateFeedbackDto {
  /** How likely the user is to recommend IREG: 1 (not likely) – 10 (very likely). Must be a JSON number. */
  @IsInt({ message: 'rating must be a whole number between 1 and 10' })
  @Min(1, { message: 'rating must be between 1 and 10' })
  @Max(10, { message: 'rating must be between 1 and 10' })
  rating!: number;

  /** Optional free text. Trimmed; an empty string is stored as NULL. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(FEEDBACK_MESSAGE_MAX_LENGTH, {
    message: `message must be at most ${FEEDBACK_MESSAGE_MAX_LENGTH} characters`,
  })
  message?: string | null;
}
