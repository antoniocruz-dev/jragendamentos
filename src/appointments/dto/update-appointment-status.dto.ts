import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus, {
    message: `Status inválido. Valores aceitos: ${Object.values(AppointmentStatus).join(', ')}`,
  })
  status: AppointmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string; // Motivo do cancelamento
}
