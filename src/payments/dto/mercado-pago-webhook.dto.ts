import { IsOptional, IsString, IsObject } from 'class-validator';

export class MercadoPagoWebhookDto {
  @IsOptional()
  @IsString()
  action?: string; // ex: "payment.created", "payment.updated"

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  data?: {
    id: string; // ID do pagamento no Mercado Pago
  };
}
