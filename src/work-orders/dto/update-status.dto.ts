import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

export class UpdateWorkOrderStatusDto {
  @IsEnum(WorkOrderStatus, {
    message: `Status inválido. Valores aceitos: ${Object.values(WorkOrderStatus).join(', ')}`,
  })
  status: WorkOrderStatus;

  @IsOptional()
  @IsString()
  reason?: string; // Motivo de cancelamento ou observação técnica
}
