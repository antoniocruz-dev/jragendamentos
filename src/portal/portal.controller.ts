import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, ValidationPipe } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientPortal } from '../auth/decorators/client-portal.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { CustomerDecisionDto } from '../work-orders/dto/customer-decision.dto.js';

/**
 * Portal do Cliente (papel CLIENT). Toda consulta filtra pelo clientId vinculado ao usuário do token
 * (lido do banco a cada requisição). OS de outro cliente responde 404, sem revelar que existe.
 * Sem acesso a financeiro, equipe ou catálogo interno: essas rotas exigem a equipe (403).
 */
@ClientPortal()
@Controller('portal')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: user.clientId! },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        vehicles: {
          select: { id: true, licensePlate: true, brand: true, model: true, year: true, color: true, currentKm: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, client };
  }

  /** OS dos veículos do cliente (orçamentos e histórico). */
  @Get('work-orders')
  workOrdersList(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.workOrder.findMany({
      where: { clientId: user.clientId!, status: { not: WorkOrderStatus.DRAFT } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        code: true,
        status: true,
        finalAmount: true,
        createdAt: true,
        finishedAt: true,
        reportedIssue: true,
        vehicle: { select: { id: true, licensePlate: true, brand: true, model: true } },
      },
    });
  }

  @Get('work-orders/:id')
  async workOrder(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertOwn(id, user.clientId!);
    return this.workOrders.findById(id); // mesmo formato público (sem custos, ISS ou comissões)
  }

  /** Aprova ou recusa o próprio orçamento (só OS em QUOTE). */
  @Patch('work-orders/:id/decision')
  async decision(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CustomerDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertOwn(id, user.clientId!);
    return this.workOrders.customerDecision(id, dto);
  }

  private async assertOwn(id: string, clientId: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, clientId, status: { not: WorkOrderStatus.DRAFT } }, select: { id: true } });
    if (!wo) throw new NotFoundException('Ordem de Serviço não encontrada.');
  }
}
