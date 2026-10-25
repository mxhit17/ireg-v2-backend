import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateBlogDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(330)
  slug!: string;

  @IsOptional()
  @IsString()
  excerpt?: string | null;

  @IsString()
  @MinLength(1)
  body!: string;

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
