import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty({ message: 'A placa do veículo é obrigatória.' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, {
    message: 'A placa informada não segue o padrão nacional válido (tradicional ou Mercosul).',
  })
  licensePlate: string;

  @IsString()
  @IsNotEmpty({ message: 'A marca é obrigatória.' })
  brand: string;

  @IsString()
  @IsNotEmpty({ message: 'O modelo é obrigatório.' })
  model: string;

  @IsInt({ message: 'O ano deve ser um número inteiro.' })
  @Min(1950, { message: 'Ano de fabricação inválido.' })
  @Max(new Date().getFullYear() + 1, { message: 'O ano não pode ser superior ao próximo ano fiscal.' })
  year: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'A quilometragem não pode ser negativa.' })
  currentKm?: number;

  @IsOptional()
  @IsString()
  chassis?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
