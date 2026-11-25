import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class BudgetDecisionDto {
  @IsIn(['APROVADO', 'REPROVADO'], { message: 'decision deve ser APROVADO ou REPROVADO.' })
  decision: 'APROVADO' | 'REPROVADO';

  /** Opcional ao aprovar; obrigatória (mín. 3 caracteres) ao reprovar — validado no serviço */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}

export class ClientAppointmentDto {
  @IsUUID('all', { message: 'Escolha um veículo.' })
  vehicleId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data inválida (AAAA-MM-DD).' })
  date: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido (HH:MM).' })
  time: string;

  @IsString()
  @MinLength(3, { message: 'Informe o serviço desejado.' })
  @MaxLength(255)
  serviceType: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
