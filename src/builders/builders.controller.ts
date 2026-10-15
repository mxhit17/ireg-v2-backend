
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BuildersService } from './builders.service';
import { CreateBuilderDto } from './dto/create-builder.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from 'src/common/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from 'src/common/pagination/pagination.dto';
import { UpdateBuilderDto } from './dto/update-builder.dto';

@Controller('builders')
export class BuildersController {
  constructor(private readonly buildersService: BuildersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBuilderDto) {
    return this.buildersService.create(dto);
  }

  @Get()
  getAllBuilders(
    @Query() query: PaginationDto,
  ) {
    return this.buildersService.getAllBuilders(query);
  }
    
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getBuilderById(@Param('id', new ParseUUIDPipe()) id: string) {
  return this.buildersService.getBuilderById(id);  
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deleteBuilder(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.buildersService.deleteBuilder(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  updateBuilder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBuilderDto,
  ) {
    return this.buildersService.updateBuilder(id, dto);
  }
}
