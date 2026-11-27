import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AssignItemMechanicDto {
  /** Mecânico do serviço; null volta o serviço para o responsável da OS. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all', { message: 'Selecione um mecânico válido.' })
  mechanicId: string | null;
}
