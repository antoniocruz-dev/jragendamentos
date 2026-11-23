import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';

/** Criação do primeiro administrador (só funciona com a base de usuários vazia). */
export class SetupAdminDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @Length(3, 150)
  name: string;

  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'A senha do administrador deve ter no mínimo 8 caracteres.' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
