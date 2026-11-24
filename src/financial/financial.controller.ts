import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { FinancialService } from './financial.service.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { ManagersOnly } from '../auth/decorators/managers-only.decorator.js';
import { CreateExpenseDto, UpdateExpenseDto, UpdateSettingsDto } from './dto/financial.dto.js';

/** Gestão financeira da oficina: relatórios, despesas e configuração fiscal (módulo Financeiro). */
@RequireModules('FINANCIAL')
@Controller('financial')
export class FinancialController {
  constructor(private readonly financial: FinancialService) {}

  /** GET /financial/report?from&to&groupBy=week|month|year&mechanicId&paymentMethod&q */
  @Get('report')
  report(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
    @Query('mechanicId') mechanicId?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('q') q?: string,
  ) {
    return this.financial.report({ from, to, groupBy, mechanicId, paymentMethod, q });
  }

  /** Dados do documento interno "Controle de Serviço" de uma OS. */
  @Get('orders/:id/closing')
  orderClosing(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.financial.orderClosing(id);
  }

  @Get('meta')
  meta() {
    return this.financial.meta();
  }

  @Get('staff')
  staff() {
    return this.financial.listStaff();
  }

  // ---------- Configuração fiscal ----------

  @Get('settings')
  settings() {
    return this.financial.getSettings();
  }

  @ManagersOnly()
  @Put('settings')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.financial.updateSettings(dto);
  }

  // ---------- Despesas ----------

  @Post('expenses')
  createExpense(@Body() dto: CreateExpenseDto) {
    return this.financial.createExpense(dto);
  }

  @Patch('expenses/:id')
  updateExpense(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateExpenseDto) {
    return this.financial.updateExpense(id, dto);
  }

  @ManagersOnly()
  @Delete('expenses/:id')
  removeExpense(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.financial.removeExpense(id);
  }
}
