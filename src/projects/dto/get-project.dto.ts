import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { project_type } from 'src/generated/prisma/enums';

export class GetProjectsDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsUUID()
  builderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(project_type)
  type?: project_type;

  @IsOptional()
  @IsIn([
    'name',
    'min_price',
    'max_price',
    'created_at',
    'updated_at',
  ])
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  orderBy?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}