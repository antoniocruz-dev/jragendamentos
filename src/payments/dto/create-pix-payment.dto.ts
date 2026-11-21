import { IsUUID, IsNotEmpty } from 'class-validator';

export class CreatePixPaymentDto {
  @IsUUID('4', { message: 'O ID da Ordem de Serviço deve ser um UUID válido.' })
  @IsNotEmpty({ message: 'O ID da Ordem de Serviço é obrigatório.' })
  workOrderId: string;
}
