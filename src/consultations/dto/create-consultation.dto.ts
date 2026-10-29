import { IsUUID } from 'class-validator';

export class CreateConsultationDto {
  @IsUUID()
  service_id!: string;
}
