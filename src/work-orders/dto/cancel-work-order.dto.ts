import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CancelWorkOrderDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Informe o motivo do cancelamento.' })
  @IsNotEmpty({ message: 'O motivo do cancelamento é obrigatório.' })
  @MaxLength(500)
  reason: string;

  /** Obrigatório (true) para cancelar uma OS já faturada. */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
