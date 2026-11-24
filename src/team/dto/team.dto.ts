import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { StaffProfile } from '@prisma/client';
import { SYSTEM_MODULES } from '../../auth/permissions.js';

const PROFILE_MESSAGE = `Perfil inválido. Valores aceitos: ${Object.values(StaffProfile).join(', ')}`;

export class CreateTeamUserDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @Length(3, 150)
  name: string;

  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'A senha inicial deve ter no mínimo 8 caracteres.' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(StaffProfile, { message: PROFILE_MESSAGE })
  profile: StaffProfile;
}

export class UpdateTeamUserDto {
  @IsOptional()
  @IsString()
  @Length(3, 150)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(StaffProfile, { message: PROFILE_MESSAGE })
  profile?: StaffProfile;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Redefinição de senha pelo gestor (opcional) */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter no mínimo 8 caracteres.' })
  password?: string;
}

export class UpdateProfilePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(SYSTEM_MODULES as unknown as string[], {
    each: true,
    message: `Módulo inválido. Valores aceitos: ${SYSTEM_MODULES.join(', ')}`,
  })
  modules: string[];
}
