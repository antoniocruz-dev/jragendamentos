import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

/** Criação do primeiro administrador (só funciona com a base de usuários vazia). */
export class SetupAdminDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @Length(3, 150)
  name: string;

  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  email: string;

  // O tamanho mínimo (8) é conferido no serviço, que responde 422
  @IsString()
  @IsNotEmpty({ message: 'A senha é obrigatória.' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
