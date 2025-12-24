import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  Query,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Stage } from '@prisma/client';

@Controller('leads')
export class LeadsAdminController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  async list(
    @Query('stage', new ParseEnumPipe(Stage, { optional: true })) stage?: Stage,
  ) {
    return this.leads.list(stage);
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    return this.leads.one(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.leads.remove(id);
  }

  @Post(':id/ready')
  async toReady(@Param('id') id: string) {
    return this.leads.toReady(id);
  }
}
