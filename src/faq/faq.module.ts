import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FaqService } from './faq.service';
import { FaqPublicController } from './faq.public.controller';
// import { FaqAdminController } from './faq.admin.controller';
import { LlmModule } from 'src/llm/llm.module';

@Module({
  imports: [PrismaModule, LlmModule],
  controllers: [FaqPublicController],
  providers: [FaqService],
})
export class FaqModule {}
