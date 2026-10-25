// import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// export class CreateCategoryDto {
//   @IsString()
//   @MaxLength(200)
//   name!: string;

//   @IsString()
//   @MaxLength(220)
//   slug!: string;

//   @IsOptional()
//   @IsString()
//   description?: string | null;

//   @IsOptional()
//   @IsInt()
//   @Min(0)
//   display_order?: number;
// }

import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;
}