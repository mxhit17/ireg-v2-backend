import {
    Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAndAdminManagementService } from './user-and-admin-management.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    roles: string[];
  };
}

@Controller('user-and-admin-management')
export class UserAndAdminManagementController {
  constructor(
    private readonly userAndAdminManagementService: UserAndAdminManagementService,
  ) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.userAndAdminManagementService.getProfile(
        req.user.id
    );
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userAndAdminManagementService.updateProfile(
      req.user.id,
      dto,
    );
  }
}
