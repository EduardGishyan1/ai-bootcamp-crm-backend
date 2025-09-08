import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsService } from './leads.service';
import { LeadsPublicController } from './leads.public.controller';
import { LeadsAdminController } from './leads.admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [LeadsPublicController, LeadsAdminController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
