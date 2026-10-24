import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PopularProjectsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}