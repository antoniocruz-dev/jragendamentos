import { IsEmail, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * "Já tenho cadastro": o cliente volta ao painel com o e-mail e os 4 últimos dígitos do
 * telefone cadastrado (segundo fator simples, sem depender de provedor de e-mail/WhatsApp).
 */
export class ClientLoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{4}$/, { message: 'Informe os 4 últimos dígitos do telefone cadastrado.' })
  phoneLast4: string;
}
