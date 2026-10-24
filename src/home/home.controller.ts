import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.gaurd';
import { GetHomeDto } from './dto/get-home.dto';
import { HomeService } from './home.service';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  getHome(@Query() query: GetHomeDto, @Req() request: AuthenticatedRequest) {
    return this.homeService.getHome(request.user?.id, query);
  }
}
