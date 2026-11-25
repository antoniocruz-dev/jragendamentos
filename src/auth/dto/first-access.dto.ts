import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class FirstAccessDto {
  @IsIn(['CLIENTE', 'EQUIPE'], { message: 'tab deve ser CLIENTE ou EQUIPE.' })
  tab: 'CLIENTE' | 'EQUIPE';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email: string;

  /** Validado no serviço: 11 dígitos (DDD + 9 + número) */
  @IsString({ message: 'Informe o WhatsApp.' })
  @MaxLength(20)
  whatsapp: string;

  @IsString()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres.' })
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  password: string;

  @IsString()
  passwordConfirmation: string;
}
