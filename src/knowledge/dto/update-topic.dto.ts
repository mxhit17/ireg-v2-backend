// import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
// import { knowledge_level } from '../../generated/prisma/enums';

// export class UpdateTopicDto {
//   @ValidateIf((_object, value) => value !== undefined)
//   @IsUUID()
//   category_id?: string;

//   @ValidateIf((_object, value) => value !== undefined)
//   @IsString()
//   @MinLength(1)
//   @MaxLength(250)
//   title?: string;

//   @ValidateIf((_object, value) => value !== undefined)
//   @IsString()
//   @MaxLength(280)
//   slug?: string;

//   @ValidateIf((_object, value) => value !== undefined)
//   @IsEnum(knowledge_level)
//   level?: knowledge_level;

//   @ValidateIf((_object, value) => value !== undefined)
//   @IsString()
//   @MinLength(1)
//   definition?: string;

//   @IsOptional()
//   @IsString()
//   simple_explanation?: string | null;

//   @IsOptional()
//   @IsArray()
//   @IsUUID('4', { each: true })
//   tag_ids?: string[];
// }
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';


import { knowledge_level, content_status } from 'src/generated/prisma/enums';

export class UpdateTopicDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  category_id?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(knowledge_level)
  level?: knowledge_level;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  definition?: string;

  @IsOptional()
  @IsString()
  simple_explanation?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(content_status)
  status?: content_status;
}