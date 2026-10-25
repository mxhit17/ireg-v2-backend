import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { project_status, project_type } from 'src/generated/prisma/enums';

export class CreateProjectRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  builder_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(project_type)
  project_type?: project_type;

  @IsOptional()
  @IsEnum(project_status)
  status?: project_status;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  locality?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  min_price?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  max_price?: number | null;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
