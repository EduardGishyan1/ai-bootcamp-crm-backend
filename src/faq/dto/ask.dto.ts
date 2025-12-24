import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class AskDto {
  @IsString()
  @Length(2, 1000)
  question: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;
}
