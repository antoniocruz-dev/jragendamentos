import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { ManagersOnly } from '../auth/decorators/managers-only.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  CreateProductDto,
  CreateServiceDto,
  SetActiveDto,
  UpdateProductDto,
  UpdateServiceDto, StockAdjustmentDto } from './dto/catalog.dto.js';

/** Catálogo de serviços (mão de obra) e peças (estoque). */
@RequireModules('CATALOG')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ---------- Serviços ----------

  /** A tela Nova OS também lista os serviços ativos. */
  @RequireModules('CATALOG', 'WORK_ORDERS')
  @Get('services')
  listServices(@Query('includeInactive') includeInactive?: string) {
    return this.catalog.listServices(includeInactive === 'true');
  }

  @Post('services')
  createService(@Body() dto: CreateServiceDto) {
    return this.catalog.createService(dto);
  }

  @Patch('services/:id')
  updateService(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateServiceDto) {
    return this.catalog.updateService(id, dto);
  }

  @ManagersOnly()
  @Patch('services/:id/active')
  setServiceActive(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetActiveDto) {
    return this.catalog.setServiceActive(id, dto.isActive);
  }

  @ManagersOnly()
  @Delete('services/:id')
  removeService(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.removeService(id);
  }

  // ---------- Peças ----------

  @RequireModules('CATALOG', 'WORK_ORDERS')
  @Get('products')
  listProducts(@Query('includeInactive') includeInactive?: string) {
    return this.catalog.listProducts(includeInactive === 'true');
  }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Patch('products/:id')
  updateProduct(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  /** Entrada/saída manual de peças (estoque negativo só com autorização do Administrador). */
  @Post('products/:id/stock')
  adjustStock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StockAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalog.adjustStock(id, dto, user);
  }

  @Get('products/:id/stock')
  stockMovements(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.stockMovements(id);
  }

  @ManagersOnly()
  @Patch('products/:id/active')
  setProductActive(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetActiveDto) {
    return this.catalog.setProductActive(id, dto.isActive);
  }

  @ManagersOnly()
  @Delete('products/:id')
  removeProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.removeProduct(id);
  }
}
