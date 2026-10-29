import { IsUUID } from 'class-validator';

export class AssignConsultationDto {
  @IsUUID()
  sme_id: string;
}
