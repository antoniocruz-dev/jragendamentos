import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  /** Código de acesso de 4 dígitos (forma principal de login) */
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'O código de acesso tem 4 dígitos.' })
  accessCode?: string;

  /** Alternativa da equipe: entrar com o e-mail */
  @IsOptional()
  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  email?: string;

  @IsString()
  @IsNotEmpty({ message: 'A senha é obrigatória.' })
  @MaxLength(200)
  password: string;

  /** Aba da tela de login */
  @IsOptional()
  @IsIn(['CLIENTE', 'EQUIPE'], { message: 'tab deve ser CLIENTE ou EQUIPE.' })
  tab?: 'CLIENTE' | 'EQUIPE';
}
