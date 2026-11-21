import { IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

/**
 * Reagendamento / edição de observações.
 * Cliente e veículo não mudam: para isso, cancele e crie outro agendamento.
 */
export class UpdateAppointmentDto {
  @IsOptional()
  @IsDateString({}, { message: 'scheduledFor deve ser uma data ISO 8601 válida.' })
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
