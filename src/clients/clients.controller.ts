import { Controller, Get, Post, Patch, Delete, Body, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ClientsService } from './clients.service.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { ManagersOnly } from '../auth/decorators/managers-only.decorator.js';
import { CreateClientWithVehicleDto } from './dto/create-client-with-vehicle.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { PortalAccessDto } from './dto/portal-access.dto.js';

@RequireModules('CLIENTS')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // Grid paginado da tela de Clientes
  @Get()
  findAll(@Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.clientsService.findAll({ q, page, pageSize });
  }

  // Lista enxuta para selects (Agendamentos e Nova OS)
  @RequireModules('CLIENTS', 'APPOINTMENTS', 'WORK_ORDERS')
  @Get('options')
  options() {
    return this.clientsService.options();
  }

  @Get('vehicles/:vehicleId/work-orders')
  vehicleWorkOrders(@Param('vehicleId', new ParseUUIDPipe()) vehicleId: string) {
    return this.clientsService.vehicleWorkOrders(vehicleId);
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

  @Get(':id/portal-access')
  portalAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientsService.portalAccess(id);
  }

  /** Cria ou redefine o login do cliente no Portal do Cliente. */
  @Post(':id/portal-access')
  grantPortalAccess(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: PortalAccessDto) {
    return this.clientsService.grantPortalAccess(id, dto);
  }

  @ManagersOnly()
  @Delete(':id/portal-access')
  revokePortalAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientsService.revokePortalAccess(id);
  }

  @Post(':id/vehicles')
  addVehicle(@Param('id', new ParseUUIDPipe()) clientId: string, @Body() dto: CreateVehicleDto) {
    return this.clientsService.addVehicle(clientId, dto);
  }
}
