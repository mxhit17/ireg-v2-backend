import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class RateProjectDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  LOCATION_CONNECTIVITY!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  AMENITIES_FACILITIES!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  SURROUNDING_ENVIRONMENT!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  CONSTRUCTION_QUALITY!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  BUILDER!: number;
}
