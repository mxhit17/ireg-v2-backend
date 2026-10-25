// import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
// import { knowledge_level } from '../../generated/prisma/enums';

// export class CreateTopicDto {
//   @IsUUID()
//   category_id!: string;

//   @IsString()
//   @MinLength(1)
//   @MaxLength(250)
//   title!: string;

//   @IsString()
//   @MaxLength(280)
//   slug!: string;

//   @IsEnum(knowledge_level)
//   level!: knowledge_level;

//   @IsString()
//   @MinLength(1)
//   definition!: string;

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
} from 'class-validator';
import { knowledge_level, content_status } from 'src/generated/prisma/enums';

export class CreateTopicDto {
  @IsUUID()
  category_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title!: string;

  @IsEnum(knowledge_level)
  level!: knowledge_level;

  @IsString()
  @IsNotEmpty()
  definition!: string;

  @IsOptional()
  @IsString()
  simple_explanation?: string;

  @IsOptional()
  @IsEnum(content_status)
  status?: content_status;
}