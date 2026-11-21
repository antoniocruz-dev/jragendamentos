import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do cliente é obrigatório.' })
  @Length(3, 150)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'O documento (CPF/CNPJ) é obrigatório.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^(\d{11}|\d{14})$/, {
    message: 'O documento deve conter 11 dígitos (CPF) ou 14 dígitos (CNPJ).',
  })
  document: string;

  @IsString()
  @IsNotEmpty({ message: 'O telefone é obrigatório.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Length(10, 11, { message: 'O telefone deve conter DDD e número (10 ou 11 dígitos).' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'A UF deve ter exatamente 2 caracteres.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  state?: string;
}
