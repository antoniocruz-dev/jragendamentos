import { IsUUID, IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID('all', { message: 'clientId inválido.' })
  clientId: string;

  @IsUUID('all', { message: 'vehicleId inválido.' })
  vehicleId: string;

  @IsDateString({}, { message: 'scheduledFor deve ser uma data ISO 8601 válida.' })
  scheduledFor: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  serviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
