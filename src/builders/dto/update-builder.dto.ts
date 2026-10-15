import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateBuilderDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  website_url?: string | null;
}