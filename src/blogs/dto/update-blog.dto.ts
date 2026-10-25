import { IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateBlogDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(330)
  slug?: string;

  @IsOptional()
  @IsString()
  excerpt?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  cover_image_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  source_name?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  source_url?: string | null;
}
