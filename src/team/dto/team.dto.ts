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
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

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

  /** Comissão do mecânico sobre a mão de obra (%) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Comissão inválida.' })
  @Min(0, { message: 'A comissão não pode ser negativa.' })
  @Max(100, { message: 'A comissão não pode passar de 100%.' })
  commissionRate?: number;

  /**
   * Redefinir acesso: a senha atual deixa de valer e a pessoa cadastra uma nova em "É meu primeiro acesso".
   * O gestor nunca define a senha de ninguém; o usuário (código de 4 dígitos) continua o mesmo.
   */
  @IsOptional()
  @IsBoolean()
  resetAccess?: boolean;
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
