import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Resposta do cliente ao orçamento, feita pelo link público da OS. */
export class CustomerDecisionDto {
  @IsIn(['APPROVE', 'REJECT'], { message: 'decision deve ser APPROVE ou REJECT.' })
  decision: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
