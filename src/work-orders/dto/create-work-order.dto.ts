import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsIn,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkOrderItemType } from '@prisma/client';

export class CreateWorkOrderItemDto {
  @IsEnum(WorkOrderItemType)
  itemType: WorkOrderItemType;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateWorkOrderDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @IsOptional()
  @IsString()
  reportedIssue?: string;

  @IsOptional()
  @IsString()
  technicalNotes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkOrderItemDto)
  items: CreateWorkOrderItemDto[];

  /** Status inicial: rascunho (DRAFT) ou orçamento para o cliente (QUOTE, padrão). */
  @IsOptional()
  @IsIn(['DRAFT', 'QUOTE'], { message: 'O status inicial deve ser DRAFT ou QUOTE.' })
  status?: 'DRAFT' | 'QUOTE';

  /** Desconto em reais sobre o total (não pode passar do total: 422). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Desconto inválido.' })
  @Min(0, { message: 'O desconto não pode ser negativo.' })
  discount?: number;
}
