import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ListFeedbackDto } from './dto/list-feedback.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

@Controller()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /** Submit feedback: 1–10 rating + optional message. */
  @Post('feedback')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createFeedback(
    @Body() dto: CreateFeedbackDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.feedbackService.createFeedback(req.user.id, dto);
  }

  /** The signed-in user's latest feedback. */
  @Get('feedback/me')
  @UseGuards(JwtAuthGuard)
  getMyFeedback(@Req() req: AuthenticatedRequest) {
    return this.feedbackService.getMyLatestFeedback(req.user.id);
  }

  /** Admin: all feedback with filters, pagination and a summary. */
  @Get('admin/feedback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listFeedback(@Query() query: ListFeedbackDto) {
    return this.feedbackService.listFeedback(query);
  }
}
