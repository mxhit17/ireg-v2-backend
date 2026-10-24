import { IsUUID } from 'class-validator';

export class RecordProjectViewDto {
  @IsUUID()
  visitorId!: string;
}