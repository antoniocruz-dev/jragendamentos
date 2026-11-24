import { Controller, Get, Post, Patch, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ClientsService } from './clients.service.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { ManagersOnly } from '../auth/decorators/managers-only.decorator.js';
import { CreateClientWithVehicleDto } from './dto/create-client-with-vehicle.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

@RequireModules('CLIENTS')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // Lista também usada pelas telas de Agendamentos e Nova OS
  @RequireModules('CLIENTS', 'APPOINTMENTS', 'WORK_ORDERS')
  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  // Busca por placa usada na abertura da OS
  @RequireModules('CLIENTS', 'APPOINTMENTS', 'WORK_ORDERS')
  @Get('vehicles/by-plate/:plate')
  findVehicleByPlate(@Param('plate') plate: string) {
    return this.clientsService.findVehicleByPlate(plate);
  }

  @Post()
  create(@Body() dto: CreateClientWithVehicleDto) {
    return this.clientsService.create(dto);
  }

  @Patch('vehicles/:vehicleId')
  updateVehicle(@Param('vehicleId', new ParseUUIDPipe()) vehicleId: string, @Body() dto: UpdateVehicleDto) {
    return this.clientsService.updateVehicle(vehicleId, dto);
  }

  @ManagersOnly()
  @Delete('vehicles/:vehicleId')
  removeVehicle(@Param('vehicleId', new ParseUUIDPipe()) vehicleId: string) {
    return this.clientsService.removeVehicle(vehicleId);
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientsService.findById(id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @ManagersOnly()
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientsService.remove(id);
  }

  @Post(':id/vehicles')
  addVehicle(@Param('id', new ParseUUIDPipe()) clientId: string, @Body() dto: CreateVehicleDto) {
    return this.clientsService.addVehicle(clientId, dto);
  }
}
