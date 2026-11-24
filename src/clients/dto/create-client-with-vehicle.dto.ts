import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateClientDto } from './create-client.dto.js';
import { CreateVehicleDto } from './create-vehicle.dto.js';

/** Cadastro do cliente com o primeiro veículo (opcional). */
export class CreateClientWithVehicleDto extends CreateClientDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVehicleDto)
  vehicle?: CreateVehicleDto;
}
