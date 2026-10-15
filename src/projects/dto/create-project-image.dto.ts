import {
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateProjectImageDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;
}