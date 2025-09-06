import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { Stage } from '@prisma/client';
import { LeadResponseDto } from './dto/lead-response.dto';

type ScheduleInfo = {
  slot?: { startsAt: string; endsAt: string; timezone?: string };
  meetingUrl?: string;
};

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLeadDto): Promise<LeadResponseDto> {
    const lead = await this.prisma.lead.create({
      data: { ...dto, stage: Stage.New },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        country: true,
        whyApplying: true,
      },
    });

    await this.prisma.message.create({
      data: {
        leadId: lead.id,
        type: 'confirmation',
        payload: {
          subject: 'Application received',
          body: 'Thanks for applying!',
        },
      },
    });

    return lead;
  }

  list(stage?: Stage) {
    return this.prisma.lead.findMany({
      where: stage ? { stage } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async one(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

//   async update(id: string, dto: UpdateLeadDto) {
//     await this.ensureExists(id);
//     return this.prisma.lead.update({ where: { id }, data: dto });
//   }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.message.deleteMany({ where: { leadId: id } });
    return this.prisma.lead.delete({ where: { id } });
  }

  private assertTransition(from: Stage, allowedFrom: Stage[]) {
    if (!allowedFrom.includes(from)) {
      throw new BadRequestException(`Transition not allowed from stage ${from}`);
    }
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.lead.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Lead not found');
  }

  async toReady(id: string) {
    const lead = await this.one(id);
    this.assertTransition(lead.stage, [Stage.New]);
    return this.prisma.lead.update({ where: { id }, data: { stage: Stage.Ready } });
  }

  async toScheduled(id: string, sched?: ScheduleInfo) {
    const lead = await this.one(id);
    this.assertTransition(lead.stage, [Stage.Ready]);

    if (sched) {
      await this.prisma.message.create({
        data: { leadId: id, type: 'schedule', payload: sched },
      });
    }

    return this.prisma.lead.update({ where: { id }, data: { stage: Stage.Scheduled } });
  }
}
