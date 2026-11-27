import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { FinancialService } from './financial.service.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { ManagersOnly } from '../auth/decorators/managers-only.decorator.js';
import { CreateExpenseDto, PayExpenseDto, ResolveRefundDto, UpdateExpenseDto, UpdateSettingsDto } from './dto/financial.dto.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ForbiddenException } from '@nestjs/common';

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

  /** Extrato do recibo de comissão: ?mechanicId&from&to ou ?mechanicId&orderIds=a,b,c */
  @Get('commission-statement')
  commissionStatement(
    @Query('mechanicId') mechanicId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('orderIds') orderIds?: string,
  ) {
    return this.financial.commissionStatement({ mechanicId, from, to, orderIds });
  }

  /** Pendências de estorno: OS faturadas que foram canceladas (?status=PENDING|REFUNDED|WAIVED|ALL). */
  @Get('refunds')
  refunds(@Query('status') status?: string) {
    return this.financial.listRefunds(status);
  }

  /** Resolve a pendência de estorno (somente Administrador). */
  @Post('refunds/:id/resolve')
  resolveRefund(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveRefundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.profile !== 'ADMINISTRADOR') throw new ForbiddenException('Somente o Administrador resolve estornos.');
    return this.financial.resolveRefund(id, dto, user.name);
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

  /** Baixa de uma conta a pagar (PENDING → PAID). */
  @Patch('expenses/:id/pay')
  payExpense(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: PayExpenseDto) {
    return this.financial.payExpense(id, dto);
  }

  /** Contas a pagar até o fim do mês (inclui vencidas) e comissões em aberto: alerta do Dashboard. */
  @Get('payables')
  payables() {
    return this.financial.payables();
  }
}
