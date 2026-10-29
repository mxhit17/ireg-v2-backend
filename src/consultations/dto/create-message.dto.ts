import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { message_type } from 'src/generated/prisma/enums';

export class CreateMessageDto {
  @IsEnum(message_type)
  message_type: message_type = message_type.TEXT;

  @ValidateIf((dto: CreateMessageDto) => dto.message_type === message_type.TEXT)
  @IsString()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  attachment_url?: string;
}
