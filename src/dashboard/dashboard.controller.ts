import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { AppointmentStatus, Prisma, RefundStatus, WorkOrderStatus } from '@prisma/client';
import { REVENUE_ORDERS } from '../financial/financial.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

function parseDate(value: string | undefined, fallback: Date, name: string) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Data "${name}" inválida.`);
  return d;
}

/**
 * Números agregados do Dashboard para um período.
 * - OS: pela data de abertura (createdAt)
 * - Faturamento: OS com status BILLED (faturada e paga) pagas no período — só para quem tem o módulo Financeiro
 * - Agendamentos: pela data agendada (scheduledFor)
 */
@RequireModules('DASHBOARD')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary(@CurrentUser() user: AuthenticatedUser, @Query('from') fromQ?: string, @Query('to') toQ?: string) {
    const now = new Date();
    const from = parseDate(fromQ, new Date(now.getFullYear(), now.getMonth(), 1), 'from');
    const to = parseDate(toQ, now, 'to');
    if (from > to) throw new BadRequestException('A data inicial deve ser anterior à final.');

    const createdInRange = { createdAt: { gte: from, lte: to } };

    const [woGroups, apptGroups, revenue] = await Promise.all([
      this.prisma.workOrder.groupBy({
        by: ['status'],
        where: createdInRange,
        _count: { _all: true },
        _sum: { finalAmount: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { scheduledFor: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      user.modules.includes('FINANCIAL')
        ? this.prisma.workOrder.aggregate({
            // Faturamento pela data do pagamento (mesma regra do módulo Financeiro)
            where: { AND: [REVENUE_ORDERS], billedAt: { gte: from, lte: to } },
            _sum: { totalServices: true, totalProducts: true, discount: true, finalAmount: true },
            _count: { _all: true },
          })
        : Promise.resolve(null),
    ]);

    // Alertas da operação (independem do período)
    const can = (m: string) => user.modules.includes(m as never);
    const [lowStock, alerts, pendingRefunds] = await Promise.all([
      can('CATALOG') || can('WORK_ORDERS')
        ? this.prisma.$queryRaw<{ id: string; name: string; sku: string; stockQuantity: number; minStock: number }[]>(Prisma.sql`
            SELECT id, name, sku, stock_quantity AS "stockQuantity", min_stock AS "minStock"
            FROM products WHERE is_active AND stock_quantity <= min_stock
            ORDER BY stock_quantity - min_stock, name LIMIT 20`)
        : Promise.resolve([]),
      this.prisma.systemAlert.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, message: true, createdAt: true, workOrderId: true },
      }),
      can('FINANCIAL') ? this.prisma.workOrder.count({ where: { refundStatus: RefundStatus.PENDING } }) : Promise.resolve(0),
    ]);

    return {
      alerts: { lowStock, items: alerts, pendingRefunds },
      period: { from: from.toISOString(), to: to.toISOString() },
      workOrders: Object.values(WorkOrderStatus).map((status) => {
        const g = woGroups.find((x) => x.status === status);
        return { status, count: g?._count._all ?? 0, amount: Number(g?._sum.finalAmount ?? 0) };
      }),
      appointments: Object.values(AppointmentStatus).map((status) => ({
        status,
        count: apptGroups.find((x) => x.status === status)?._count._all ?? 0,
      })),
      revenue: revenue
        ? {
            orders: revenue._count._all,
            services: Number(revenue._sum.totalServices ?? 0),
            products: Number(revenue._sum.totalProducts ?? 0),
            discount: Number(revenue._sum.discount ?? 0),
            total: Number(revenue._sum.finalAmount ?? 0),
          }
        : null,
    };
  }

  /** Marca um alerta como resolvido (some do Dashboard). */
  @Patch('alerts/:id/resolve')
  async resolveAlert(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.prisma.systemAlert.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    return { resolved: true };
  }
}
