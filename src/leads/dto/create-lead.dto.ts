import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @Length(2, 120)
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsString()
  @Length(5, 1000)
  whyApplying: string;
}
