import {
  IsUUID,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
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
}
