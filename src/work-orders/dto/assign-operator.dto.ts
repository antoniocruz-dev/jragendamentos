import { IsUUID } from 'class-validator';

export class AssignOperatorDto {
  @IsUUID('4', { message: 'Selecione um mecânico válido.' })
  operatorId: string;
}
