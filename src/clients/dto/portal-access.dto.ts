import { IsEmail, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Acesso do cliente ao Portal (login próprio, papel CLIENT). */
export class PortalAccessDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido para o acesso do cliente.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'A senha do cliente deve ter no mínimo 8 caracteres.' })
  password: string;
}
