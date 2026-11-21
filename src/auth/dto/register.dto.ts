import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @Length(3, 150)
  name: string;

  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'A senha deve conter no mínimo 6 caracteres.' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Perfil de usuário inválido.' })
  role?: UserRole;
}
