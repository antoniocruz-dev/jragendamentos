import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { UpdateWorkOrderStatusDto } from './dto/update-status.dto.js';
import { CustomerDecisionDto } from './dto/customer-decision.dto.js';
import { WorkOrderStatus } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { ManagersOnly } from '../auth/decorators/managers-only.decorator.js';
import { BillWorkOrderDto, ReverseBillingDto } from '../financial/dto/financial.dto.js';
import { CancelWorkOrderDto } from './dto/cancel-work-order.dto.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { WorkOrderActor } from './work-orders.service.js';

const staffActor = (u: AuthenticatedUser) => ({ kind: 'staff' as const, name: u.name, profile: u.profile });

@RequireModules('WORK_ORDERS')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateWorkOrderDto,
  ) {
    return this.workOrdersService.create(dto);
  }

  // Lista de OS (o Dashboard usa /dashboard/summary)
  @RequireModules('WORK_ORDERS')
  @Get()
  async listAll(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.workOrdersService.listAll({ status, q, page, pageSize });
  }

  /** Equipe ativa, para escolher o mecânico responsável ao registrar o pagamento. */
  @RequireModules('WORK_ORDERS', 'FINANCIAL')
  @Get('staff')
  listStaff() {
    return this.workOrdersService.listStaff();
  }

  /** Registra o pagamento de uma OS concluída (faturamento). */
  @RequireModules('WORK_ORDERS', 'FINANCIAL')
  @Post(':id/billing')
  bill(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: BillWorkOrderDto) {
    return this.workOrdersService.bill(id, dto);
  }

  /** Estorna o faturamento (volta a OS para Concluída e cancela a entrada no caixa). */
  @RequireModules('FINANCIAL')
  @ManagersOnly()
  @Post(':id/billing/reverse')
  reverseBilling(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ReverseBillingDto) {
    return this.workOrdersService.reverseBilling(id, dto.reason);
  }

  /**
   * Aprovação restrita: Administrador, Gerente Geral ou Auxiliar Administrativo.
   * Baixa as peças; se faltar alguma, a OS vai para Aguardando Peças (resposta 200 com o novo status).
   */
  @Patch(':id/approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workOrdersService.approve(id, staffActor(user) as WorkOrderActor);
  }

  /** Cancelamento com motivo. OS faturada: só Administrador, com confirmação e estorno manual pendente. */
  @Patch(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelWorkOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workOrdersService.cancel(id, dto, staffActor(user));
  }

  /** Público: é a página que o cliente abre pelo link da OS (UUID não adivinhável). */
  @Public()
  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.workOrdersService.findById(id);
  }

  /**
   * Público: o cliente aprova ou recusa o orçamento pelo link da OS.
   * Só age em OS no status QUOTE; demais mudanças de status exigem login da equipe.
   */
  @Public()
  @Patch(':id/customer-decision')
  async customerDecision(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CustomerDecisionDto,
  ) {
    return this.workOrdersService.customerDecision(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: UpdateWorkOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workOrdersService.updateStatus(id, dto, staffActor(user));
  }
}
