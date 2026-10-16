import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetProjectCommentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sortBy: 'newest' | 'oldest' = 'newest';
}