import { IsOptional, IsUrl } from 'class-validator';

export class InitiatePaymentDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  return_url?: string;
}
