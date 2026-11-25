import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

/** Entrada do cliente no painel (sem senha): nome completo, e-mail e contato. */
export class ClientEntryDto {
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Informe o nome completo.' })
  @MaxLength(150)
  @Matches(/^\S+(\s+\S+)+$/, { message: 'Informe o nome completo (nome e sobrenome).' })
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email: string;

  /** Telefone/WhatsApp com DDD (10 ou 11 dígitos); validado no serviço */
  @IsString({ message: 'Informe o contato (telefone com DDD).' })
  @MaxLength(20)
  phone: string;
}
