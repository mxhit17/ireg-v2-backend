import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { AssignConsultationDto } from './dto/assign-consultation.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; roles: string[] };
}

interface WebhookRequest extends Request {
  rawBody?: Buffer;
  headers: Request['headers'] & {
    'x-webhook-signature'?: string;
    'x-webhook-timestamp'?: string;
  };
}

@Controller()
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Get('consultation-services')
  listServices() {
    return this.consultations.listServices();
  }

  @Get('consultation-services/:id')
  getService(@Param('id', ParseUUIDPipe) id: string) {
    return this.consultations.getService(id);
  }

  @Post('consultations')
  @UseGuards(JwtAuthGuard)
  createConsultation(
    @Body() dto: CreateConsultationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consultations.createConsultation(req.user.id, dto);
  }

  @Get('consultations/me')
  @UseGuards(JwtAuthGuard)
  listMine(@Req() req: AuthenticatedRequest) {
    return this.consultations.listMine(req.user.id);
  }

  @Get('consultations/:id')
  @UseGuards(JwtAuthGuard)
  getConsultation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consultations.getConsultation(id, req.user.id, req.user.roles);
  }

  @Post('consultations/:id/payment')
  @UseGuards(JwtAuthGuard)
  initiatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InitiatePaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consultations.initiatePayment(id, req.user.id, dto.return_url);
  }

  @Get('consultations/:id/payment-status')
  @UseGuards(JwtAuthGuard)
  getPaymentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consultations.getPaymentStatus(id, req.user.id, req.user.roles);
  }

  @Post('payments/webhook')
  processPaymentWebhook(@Req() req: WebhookRequest, @Body() event: unknown) {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    return this.consultations.processPaymentWebhook(
      req.rawBody,
      typeof signature === 'string' ? signature : undefined,
      typeof timestamp === 'string' ? timestamp : undefined,
      event,
    );
  }

  @Post('admin/consultations/:id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  assignConsultation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignConsultationDto,
  ) {
    return this.consultations.assign(id, dto.sme_id);
  }

  @Get('consultations/:id/messages')
  @UseGuards(JwtAuthGuard)
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consultations.listMessages(
      id,
      req.user.id,
      req.user.roles,
      query,
    );
  }

  @Post('consultations/:id/messages')
  @UseGuards(JwtAuthGuard)
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consultations.sendMessage(id, req.user.id, req.user.roles, dto);
  }

  @Patch('consultations/:id/messages/read')
  @UseGuards(JwtAuthGuard)
  markMessagesRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.consultations.markMessagesRead(id, req.user.id, req.user.roles);
  }

  @Post('admin/consultations/:id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  completeConsultation(@Param('id', ParseUUIDPipe) id: string) {
    return this.consultations.complete(id);
  }
}
