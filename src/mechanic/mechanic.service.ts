import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObservationType, Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { isMechanic, isPrivileged, observationRole } from '../common/roles.js';

/** Status do SPEC (vocabulário do mecânico) x status internos da OS. */
export type MechanicStatus =
  | 'AGUARDANDO_APROVACAO'
  | 'AGUARDANDO_INICIO'
  | 'EM_EXECUCAO'
  | 'AGUARDANDO_PECA'
  | 'EM_TESTE'
  | 'CONCLUIDA';

const TO_INTERNAL: Record<Exclude<MechanicStatus, 'AGUARDANDO_APROVACAO'>, WorkOrderStatus> = {
  AGUARDANDO_INICIO: WorkOrderStatus.APPROVED,
  EM_EXECUCAO: WorkOrderStatus.IN_PROGRESS,
  AGUARDANDO_PECA: WorkOrderStatus.WAITING_PARTS,
  EM_TESTE: WorkOrderStatus.TESTING,
  CONCLUIDA: WorkOrderStatus.COMPLETED,
};

export function mechanicStatus(status: WorkOrderStatus): MechanicStatus | null {
  switch (status) {
    case WorkOrderStatus.QUOTE:
      return 'AGUARDANDO_APROVACAO';
    case WorkOrderStatus.APPROVED:
      return 'AGUARDANDO_INICIO';
    case WorkOrderStatus.IN_PROGRESS:
      return 'EM_EXECUCAO';
    case WorkOrderStatus.WAITING_PARTS:
      return 'AGUARDANDO_PECA';
    case WorkOrderStatus.TESTING:
      return 'EM_TESTE';
    case WorkOrderStatus.COMPLETED:
    case WorkOrderStatus.BILLED:
      return 'CONCLUIDA';
    default:
      return null;
  }
}

/**
 * Fluxo do mecânico: AGUARDANDO_INICIO -> EM_EXECUCAO -> (AGUARDANDO_PECA | EM_TESTE) -> CONCLUIDA.
 * Peça chegou: AGUARDANDO_PECA volta para EM_EXECUCAO. Teste reprovado: EM_TESTE volta para EM_EXECUCAO.
 */
const MECHANIC_FLOW: Partial<Record<MechanicStatus, MechanicStatus[]>> = {
  AGUARDANDO_INICIO: ['EM_EXECUCAO'],
  EM_EXECUCAO: ['AGUARDANDO_PECA', 'EM_TESTE'],
  AGUARDANDO_PECA: ['EM_EXECUCAO'],
  EM_TESTE: ['CONCLUIDA', 'EM_EXECUCAO'],
};

/** OS que aparecem no portal (rascunho e cancelada não). */
const VISIBLE: WorkOrderStatus[] = [
  WorkOrderStatus.QUOTE,
  WorkOrderStatus.APPROVED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.WAITING_PARTS,
  WorkOrderStatus.TESTING,
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.BILLED,
];

/**
 * Portal do Mecânico. Regra central: NADA de valores unitários, custos, descontos, comissões ou
 * faturamento — os selects abaixo listam campo a campo o que sai (nunca `include` da OS inteira).
 * Mecânico vê só as OS em que é o mecânico responsável (operador); outra OS responde 403.
 */
@Injectable()
export class MechanicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  /** Contadores e fechamento do mês: só os totais de peças e serviços das próprias OS concluídas. */
  async dashboard(user: AuthenticatedUser, month?: string) {
    const { start, end, label } = monthRange(month);
    const own: Prisma.WorkOrderWhereInput = { operatorId: user.id };
    const closedInMonth: Prisma.WorkOrderWhereInput = {
      ...own,
      status: { in: [WorkOrderStatus.COMPLETED, WorkOrderStatus.BILLED] },
      finishedAt: { gte: start, lt: end },
    };

    const [queue, running, done, sums] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where: { ...own, status: WorkOrderStatus.APPROVED } }),
      this.prisma.workOrder.count({
        where: { ...own, status: { in: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.WAITING_PARTS, WorkOrderStatus.TESTING] } },
      }),
      this.prisma.workOrder.count({ where: closedInMonth }),
      this.prisma.workOrder.aggregate({ where: closedInMonth, _sum: { totalProducts: true, totalServices: true } }),
    ]);
    const totalParts = Number(sums._sum.totalProducts ?? 0);
    const totalServices = Number(sums._sum.totalServices ?? 0);
    return {
      month: label,
      counters: { queue, running, done },
      closing: {
        total_parts: round2(totalParts),
        total_services: round2(totalServices),
        grand_total: round2(totalParts + totalServices),
      },
    };
  }

  async list(user: AuthenticatedUser) {
    const rows = await this.prisma.workOrder.findMany({
      where: { operatorId: user.id, status: { in: VISIBLE } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        code: true,
        status: true,
        reopenCount: true,
        reportedIssue: true,
        createdAt: true,
        finishedAt: true,
        client: { select: { name: true } },
        vehicle: { select: { licensePlate: true, brand: true, model: true, year: true } },
      },
    });
    return rows.map((r) => ({ ...r, mechanicStatus: mechanicStatus(r.status) }));
  }

  /** Detalhe técnico, sem nenhum dado financeiro. */
  async detail(user: AuthenticatedUser, id: string) {
    await this.assertAccess(user, id);
    const wo = await this.prisma.workOrder.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        budgetStatus: true,
        reopenCount: true,
        reportedIssue: true,
        technicalNotes: true,
        createdAt: true,
        finishedAt: true,
        operator: { select: { id: true, name: true } },
        client: { select: { name: true } },
        vehicle: { select: { licensePlate: true, brand: true, model: true, year: true, color: true, currentKm: true } },
        items: {
          select: {
            id: true,
            itemType: true,
            quantity: true,
            service: { select: { name: true, estimatedMinutes: true } },
            product: { select: { name: true, sku: true } },
          },
        },
        observations: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, authorName: true, authorRole: true, type: true, message: true, createdAt: true },
        },
      },
    });
    const ms = mechanicStatus(wo.status);
    const canReopen =
      wo.status === WorkOrderStatus.COMPLETED && (isPrivileged(user) || (isMechanic(user) && wo.reopenCount === 0));
    return {
      ...wo,
      mechanicStatus: ms,
      nextStatuses: ms ? (MECHANIC_FLOW[ms] ?? []) : [],
      canReopen,
    };
  }

  /** Avança o status pela máquina de estados do mecânico (a regra geral da OS também é validada). */
  async updateStatus(user: AuthenticatedUser, id: string, target: MechanicStatus) {
    await this.assertAccess(user, id);
    const wo = await this.prisma.workOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    const current = mechanicStatus(wo.status);
    if (wo.status === WorkOrderStatus.BILLED) throw new BadRequestException('OS já faturada: o status não muda mais.');
    const allowed = current ? (MECHANIC_FLOW[current] ?? []) : [];
    if (!allowed.includes(target) || target === 'AGUARDANDO_APROVACAO') {
      throw new BadRequestException(
        `Transição inválida: de ${current ?? wo.status} só é possível ir para ${allowed.join(' ou ') || 'nenhum status (aguarde a oficina)'}.`,
      );
    }
    await this.workOrders.updateStatus(
      id,
      { status: TO_INTERNAL[target as Exclude<MechanicStatus, 'AGUARDANDO_APROVACAO'>] },
      { kind: 'staff', name: user.name, profile: user.profile },
    );
    return this.detail(user, id);
  }

  /**
   * Reabre uma OS CONCLUIDA (volta para EM_EXECUCAO) com justificativa obrigatória.
   * Mecânico: só uma vez (reopen_count === 0). Administrador/Gerente Geral: sem limite.
   * A condição vai no próprio UPDATE: duas reaberturas simultâneas não passam do limite.
   */
  async reopen(user: AuthenticatedUser, id: string, justification: string) {
    await this.assertAccess(user, id);
    const privileged = isPrivileged(user);

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.workOrder.updateMany({
        where: { id, status: WorkOrderStatus.COMPLETED, ...(privileged ? {} : { reopenCount: 0 }) },
        data: { status: WorkOrderStatus.IN_PROGRESS, reopenCount: { increment: 1 }, finishedAt: null },
      });
      if (res.count !== 1) {
        const wo = await tx.workOrder.findUniqueOrThrow({ where: { id }, select: { status: true, reopenCount: true } });
        if (wo.status === WorkOrderStatus.BILLED) {
          throw new BadRequestException('OS já faturada não pode ser reaberta.');
        }
        if (wo.status !== WorkOrderStatus.COMPLETED) {
          throw new BadRequestException('Só é possível reabrir uma OS concluída.');
        }
        throw new ForbiddenException('Esta OS já foi reaberta uma vez. Apenas Administrador ou Gerente Geral podem reabrir novamente.');
      }
      await tx.workOrderObservation.create({
        data: {
          workOrderId: id,
          authorId: user.id,
          authorName: user.name,
          authorRole: observationRole(user),
          type: ObservationType.REABERTURA,
          message: justification,
        },
      });
    });
    return this.detail(user, id);
  }

  async addObservation(user: AuthenticatedUser, id: string, message: string) {
    await this.assertAccess(user, id);
    const wo = await this.prisma.workOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (!VISIBLE.includes(wo.status)) throw new ConflictException('Esta OS não aceita novas observações.');
    return this.prisma.workOrderObservation.create({
      data: {
        workOrderId: id,
        authorId: user.id,
        authorName: user.name,
        authorRole: observationRole(user),
        type: ObservationType.TECNICA_MECANICO,
        message,
      },
      select: { id: true, authorName: true, authorRole: true, type: true, message: true, createdAt: true },
    });
  }

  /** Mecânico: só a própria OS (403). Privilegiados: qualquer OS visível. */
  private async assertAccess(user: AuthenticatedUser, id: string) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, select: { operatorId: true, status: true } });
    if (!wo || !VISIBLE.includes(wo.status)) throw new NotFoundException('Ordem de Serviço não encontrada.');
    if (!isPrivileged(user) && wo.operatorId !== user.id) {
      throw new ForbiddenException('Esta OS está atribuída a outro mecânico.');
    }
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mês AAAA-MM no fuso da oficina (UTC-3). Padrão: mês atual. */
function monthRange(month?: string) {
  const now = new Date(Date.now() - 3 * 3600_000);
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  if (month) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new BadRequestException('Mês inválido (use AAAA-MM).');
    y = Number(match[1]);
    m = Number(match[2]);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = new Date(`${y}-${pad(m)}-01T00:00:00-03:00`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = new Date(`${ny}-${pad(nm)}-01T00:00:00-03:00`);
  return { start, end, label: `${y}-${pad(m)}` };
}
