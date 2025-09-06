export class LeadResponseDto {
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  whyApplying: string;
}
