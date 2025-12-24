// src/faq/faq.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FaqService } from './faq.service';
import { AskDto } from './dto/ask.dto';

@Controller('faq')
export class FaqPublicController {
  constructor(private readonly faq: FaqService) {}

  @Post('ask')
  ask(@Body() dto: AskDto) {
    return this.faq.ask(dto);
  }

  @Get('sessions')
  listSessions() {
    return this.faq.listSessions();
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.faq.getSession(id);
  }
}
