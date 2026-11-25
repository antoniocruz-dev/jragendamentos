import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  /** Usuário: código de 4 dígitos gerado pelo banco (a senha é a que a pessoa cadastrou) */
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'O usuário é o código de 4 dígitos.' })
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
