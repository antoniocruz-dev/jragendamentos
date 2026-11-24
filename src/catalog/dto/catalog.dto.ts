import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do serviço é obrigatório.' })
  @Length(2, 120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Preço inválido.' })
  @Min(0, { message: 'O preço não pode ser negativo.' })
  basePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'O tempo estimado deve ser de pelo menos 1 minuto.' })
  estimatedMinutes?: number;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'O código (SKU) é obrigatório.' })
  @Length(1, 50)
  sku: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome da peça é obrigatório.' })
  @Length(2, 150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Preço de custo inválido.' })
  @Min(0)
  costPrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Preço de venda inválido.' })
  @Min(0)
  salePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'O estoque não pode ser negativo.' })
  stockQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class SetActiveDto {
  @IsBoolean()
  isActive: boolean;
}
