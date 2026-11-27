import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { parsePage, searchTerms, toPage } from '../common/pagination.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { UpdateWorkOrderStatusDto } from './dto/update-status.dto.js';
import { CustomerDecisionDto } from './dto/customer-decision.dto.js';
import {
  WorkOrderStatus,
  WorkOrderItemType,
  Prisma,
  PaymentMethod,
  TransactionStatus,
  TransactionType,
  UserRole,
  StaffProfile,
  AlertType,
  RefundStatus,
  BudgetStatus,
  ObservationAuthorRole,
  ObservationType,
} from '@prisma/client';
import { BillWorkOrderDto } from '../financial/dto/financial.dto.js';
import { COMMISSION_RATE } from '../financial/financial-calc.js';
import { CancelWorkOrderDto } from './dto/cancel-work-order.dto.js';
import { MECHANIC_PROFILES, isPrivileged, observationRole } from '../common/roles.js';
import { InsufficientStockError, reserveWorkOrderStock, returnWorkOrderStock, shortageText, type StockShortage } from '../common/stock.js';

/** Quem está agindo na OS: alguém da equipe (com cargo) ou o próprio cliente (link/portal). */
export type WorkOrderActor =
  | { kind: 'staff'; name: string; profile: StaffProfile | null }
  | { kind: 'client'; name: string };

/** Cargos que podem aprovar orçamentos (mecânicos e auxiliares de oficina não podem). */
export const APPROVER_PROFILES: StaffProfile[] = [
  StaffProfile.ADMINISTRADOR,
  StaffProfile.GERENTE_GERAL,
  StaffProfile.AUXILIAR_ADMINISTRATIVO,
];

export interface ApprovalResult {
  id: string;
  code: number;
  status: WorkOrderStatus;
  shortages: StockShortage[];
}

/** Mensagem da validação de desconto (desconto só em peças). */
function discountMessage(totalProducts: Prisma.Decimal) {
  const limit = totalProducts.toFixed(2).replace('.', ',');
  return `O desconto vale só para peças e não pode passar do total de peças (R$ ${limit}).`;
}

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Quem está criando ou alterando a OS (para as travas de perfil do mecânico responsável). */
  async create(dto: CreateWorkOrderDto, actor?: { id: string; name: string; role: string; profile: StaffProfile | null }) {
    const { clientId, vehicleId, reportedIssue, technicalNotes, items } = dto;
    const itemMechanics = [...new Set(items.map((i) => i.mechanicId).filter((id): id is string => !!id))];
    // Só Administrador e Gerente Geral escolhem mecânicos na abertura (responsável e de cada serviço)
    const assigning = (dto.operatorId !== undefined && dto.operatorId !== null) || itemMechanics.length > 0;
    if (assigning && (!actor || !isPrivileged(actor))) {
      throw new ForbiddenException('Só Administrador e Gerente Geral podem atribuir mecânicos à OS.');
    }
    if (items.some((i) => i.mechanicId && i.itemType !== WorkOrderItemType.SERVICE)) {
      throw new BadRequestException('Só serviços recebem mecânico; peças não.');
    }
    // Sem responsável escolhido, o mecânico do 1º serviço assume a OS (Área do Mecânico e faturamento)
    const operatorId = dto.operatorId || items.find((i) => i.itemType === WorkOrderItemType.SERVICE && i.mechanicId)?.mechanicId || undefined;
    for (const id of new Set([...(operatorId ? [operatorId] : []), ...itemMechanics])) {
      await this.assertActiveMechanic(this.prisma, id);
    }
    const initialStatus = dto.status === 'DRAFT' ? WorkOrderStatus.DRAFT : WorkOrderStatus.QUOTE;

    // 1. Validar integridade Cliente x Veículo
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }

    if (vehicle.clientId !== clientId) {
      throw new BadRequestException('O veículo informado não pertence ao cliente indicado.');
    }

    if (items.length === 0) {
      throw new BadRequestException('A Ordem de Serviço deve conter ao menos um item ou serviço.');
    }

    // 2. Transação Atômica com isolamento ACID
    return this.prisma.$transaction(async (tx) => {
      let totalServices = new Prisma.Decimal(0.00);
      let totalProducts = new Prisma.Decimal(0.00);

      const itemsToCreate: Array<{
        itemType: WorkOrderItemType;
        serviceId?: string;
        productId?: string;
        mechanicId?: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        totalPrice: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      }> = [];

      for (const item of items) {
        if (item.itemType === WorkOrderItemType.SERVICE) {
          if (!item.serviceId) {
            throw new BadRequestException('O campo serviceId é obrigatório para itens do tipo SERVICE.');
          }

          const service = await tx.service.findUnique({
            where: { id: item.serviceId },
          });

          if (!service || !service.isActive) {
            throw new NotFoundException(`Serviço ativo não encontrado para o ID: ${item.serviceId}`);
          }

          const itemTotal = service.basePrice.mul(item.quantity);
          totalServices = totalServices.add(itemTotal);

          itemsToCreate.push({
            itemType: WorkOrderItemType.SERVICE,
            serviceId: service.id,
            // Escolha explícita fica gravada (trocar o responsável depois não mexe neste serviço)
            mechanicId: item.mechanicId || undefined,
            quantity: item.quantity,
            unitPrice: service.basePrice,
            totalPrice: itemTotal,
            unitCost: new Prisma.Decimal(0),
          });
        } else if (item.itemType === WorkOrderItemType.PRODUCT) {
          if (!item.productId) {
            throw new BadRequestException('O campo productId é obrigatório para itens do tipo PRODUCT.');
          }

          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product || !product.isActive) {
            throw new NotFoundException(`Produto ativo não encontrado para o ID: ${item.productId}`);
          }

          const itemTotal = product.salePrice.mul(item.quantity);
          totalProducts = totalProducts.add(itemTotal);

          itemsToCreate.push({
            itemType: WorkOrderItemType.PRODUCT,
            productId: product.id,
            quantity: item.quantity,
            unitPrice: product.salePrice,
            totalPrice: itemTotal,
            // Custo de saída congelado na OS (base do custo das peças no financeiro)
            unitCost: product.costPrice,
          });

        }
      }

      // Desconto: só nas peças, nunca na mão de obra (regra da oficina) — não pode passar do total de peças (422)
      const gross = totalServices.add(totalProducts);
      const discount = new Prisma.Decimal(dto.discount ?? 0);
      if (discount.gt(totalProducts)) {
        throw new UnprocessableEntityException(discountMessage(totalProducts));
      }
      const finalAmount = gross.sub(discount);

      // 3. Criação da Ordem de Serviço com itens vinculados
      const workOrder = await tx.workOrder.create({
        data: {
          clientId,
          vehicleId,
          operatorId,
          reportedIssue,
          technicalNotes,
          // Rascunho ou orçamento. As peças só saem do estoque na aprovação.
          status: initialStatus,
          totalServices,
          totalProducts,
          discount,
          finalAmount,
          items: {
            create: itemsToCreate,
          },
        },
        include: {
          client: {
            select: { id: true, name: true, phone: true, document: true },
          },
          vehicle: {
            select: { id: true, licensePlate: true, brand: true, model: true, year: true },
          },
          items: {
            include: {
              service: { select: { id: true, name: true } },
              product: { select: { id: true, sku: true, name: true } },
              mechanic: { select: { id: true, name: true } },
            },
          },
        },
      });

      return workOrder;
    });
  }

  /**
   * Detalhe da OS. É a mesma rota pública aberta pelo cliente: NÃO expõe custos de peças,
   * comissões, ISS nem dados internos da equipe.
   */
  async findById(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        clientId: true,
        vehicleId: true,
        operatorId: true,
        status: true,
        budgetStatus: true,
        reopenCount: true,
        totalServices: true,
        totalProducts: true,
        discount: true,
        finalAmount: true,
        reportedIssue: true,
        technicalNotes: true,
        createdAt: true,
        updatedAt: true,
        finishedAt: true,
        billedAt: true,
        paymentMethod: true,
        installments: true,
        client: { select: { id: true, name: true, phone: true, email: true, document: true } },
        vehicle: { select: { id: true, licensePlate: true, brand: true, model: true, year: true, color: true, currentKm: true } },
        operator: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            itemType: true,
            serviceId: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            service: { select: { id: true, name: true, description: true } },
            product: { select: { id: true, name: true, sku: true } },
            mechanic: { select: { id: true, name: true } },
          },
        },
        transactions: {
          where: { type: 'INCOME', status: { not: 'CANCELLED' } },
          select: { id: true, amount: true, paymentMethod: true, installments: true, status: true, paidAt: true },
        },
      },
    });

    if (!workOrder) {
      throw new NotFoundException(`Ordem de Serviço com ID ${id} não encontrada.`);
    }

    return workOrder;
  }

  /**
   * Grid de OS paginado no banco. A busca (nº da OS, placa ou cliente) e o status são filtrados
   * no SQL; `counts` traz o total por status para as abas (respeitando a busca).
   */
  async listAll(filters: { status?: string; q?: string; page?: string; pageSize?: string; operatorId?: string }) {
    const { page, pageSize, skip, take } = parsePage(filters.page, filters.pageSize);
    const { text, digits, plate } = searchTerms(filters.q);

    const or: Prisma.WorkOrderWhereInput[] = [];
    if (text) {
      or.push({ client: { name: { contains: text, mode: 'insensitive' } } });
      if (plate.length >= 2) or.push({ vehicle: { licensePlate: { contains: plate } } });
      if (digits && digits.length <= 9 && digits === text.replace(/^#/, '')) or.push({ code: Number(digits) });
    }
    const searchWhere: Prisma.WorkOrderWhereInput = or.length ? { OR: or } : {};
    // Filtro por mecânico: id do mecânico ou "none" (sem mecânico). Combina com a busca e o status.
    const op = filters.operatorId?.trim();
    if (op === 'none') {
      searchWhere.operatorId = null;
      searchWhere.items = { none: { mechanicId: { not: null } } };
    } else if (op) {
      if (!/^[0-9a-f-]{36}$/i.test(op)) throw new BadRequestException('Mecânico inválido no filtro.');
      // Responsável da OS ou mecânico de algum serviço
      searchWhere.AND = [{ OR: [{ operatorId: op }, { items: { some: { mechanicId: op } } }] }];
    }

    const status = filters.status && filters.status in WorkOrderStatus ? (filters.status as WorkOrderStatus) : undefined;
    const where: Prisma.WorkOrderWhereInput = status ? { ...searchWhere, status } : searchWhere;

    const [items, total, grouped] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        select: {
          id: true,
          code: true,
          status: true,
          finalAmount: true,
          createdAt: true,
          client: { select: { name: true, phone: true } },
          vehicle: { select: { licensePlate: true, brand: true, model: true, year: true } },
          operator: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { code: 'desc' }],
        skip,
        take,
      }),
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.groupBy({ by: ['status'], where: searchWhere, _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);

    const counts: Record<string, number> = { ALL: 0 };
    for (const g of grouped) {
      const n = (g._count as { _all: number })._all;
      counts[g.status] = n;
      counts.ALL += n;
    }
    return { ...toPage(items, total, page, pageSize), counts };
  }

  /**
   * Mapa de transições de status válidas
   */
  private readonly allowedTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
    [WorkOrderStatus.DRAFT]: [WorkOrderStatus.QUOTE, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.QUOTE]: [WorkOrderStatus.APPROVED, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.APPROVED]: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.IN_PROGRESS]: [
      WorkOrderStatus.WAITING_PARTS,
      WorkOrderStatus.TESTING,
      WorkOrderStatus.COMPLETED,
      WorkOrderStatus.CANCELLED,
    ],
    [WorkOrderStatus.TESTING]: [WorkOrderStatus.COMPLETED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.WAITING_PARTS]: [WorkOrderStatus.APPROVED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.COMPLETED]: [WorkOrderStatus.BILLED],
    [WorkOrderStatus.BILLED]: [], // Estado final
    [WorkOrderStatus.CANCELLED]: [], // Estado final
  };

  /**
   * Decisão do cliente sobre o orçamento (link público ou Área do Cliente). Só vale para OS em QUOTE
   * com orçamento ainda pendente: uma segunda decisão recebe 409.
   * Registra a observação (tipo ORCAMENTO_CLIENTE) e o budget_status. Reprovar exige observação.
   */
  async customerDecision(id: string, dto: CustomerDecisionDto, author?: { id: string; name: string }) {
    const workOrder = await this.findById(id);
    const reason = dto.reason?.trim() || '';

    if (workOrder.status !== WorkOrderStatus.QUOTE || workOrder.budgetStatus !== BudgetStatus.PENDING) {
      throw new ConflictException('Este orçamento não está mais aguardando aprovação.');
    }
    if (dto.decision === 'REJECT' && reason.length < 3) {
      throw new UnprocessableEntityException('Conte para a oficina o motivo da reprovação (observação obrigatória).');
    }

    // Trava a decisão (duas abas/cliques simultâneos: só a primeira vale)
    const locked = await this.prisma.workOrder.updateMany({
      where: { id, status: WorkOrderStatus.QUOTE, budgetStatus: BudgetStatus.PENDING },
      data: { budgetStatus: dto.decision === 'APPROVE' ? BudgetStatus.APPROVED : BudgetStatus.REJECTED },
    });
    if (locked.count !== 1) throw new ConflictException('Este orçamento já recebeu uma decisão.');

    await this.prisma.workOrderObservation.create({
      data: {
        workOrderId: id,
        authorId: author?.id ?? null,
        authorName: author?.name ?? workOrder.client.name,
        authorRole: ObservationAuthorRole.CLIENTE,
        type: ObservationType.ORCAMENTO_CLIENTE,
        message: reason || (dto.decision === 'APPROVE' ? 'Orçamento aprovado.' : 'Orçamento reprovado.'),
      },
    });

    const actor: WorkOrderActor = { kind: 'client', name: author?.name ?? workOrder.client.name };
    if (dto.decision === 'APPROVE') {
      await this.approve(id, actor);
    } else {
      await this.updateStatus(
        id,
        { status: WorkOrderStatus.CANCELLED, reason: `Recusado pelo cliente: ${reason}` },
        actor,
      );
    }

    // Retorna o mesmo formato detalhado usado pela página da OS
    return this.findById(id);
  }

  async updateStatus(id: string, dto: UpdateWorkOrderStatusDto, actor: WorkOrderActor) {
    const { status: targetStatus, reason } = dto;

    // Aprovar tem regra própria: cargo autorizado + baixa de estoque (ou Aguardando Peças)
    if (targetStatus === WorkOrderStatus.APPROVED) {
      if (actor.kind === 'staff' && !(actor.profile && APPROVER_PROFILES.includes(actor.profile))) {
        throw new ForbiddenException('Somente Administrador, Gerente Geral ou Auxiliar Administrativo podem aprovar a OS.');
      }
      const current = await this.prisma.workOrder.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw new NotFoundException(`Ordem de Serviço com ID ${id} não encontrada.`);
      if (current.status !== WorkOrderStatus.WAITING_PARTS) {
        const result = await this.approve(id, actor);
        return this.prisma.workOrder.findUnique({ where: { id }, include: { items: true } }).then((wo) => ({ ...wo, shortages: result.shortages }));
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Busca a OS atual com os itens de produto
      const workOrder = await tx.workOrder.findUnique({
        where: { id },
        include: {
          items: true,
        },
      });

      if (!workOrder) {
        throw new NotFoundException(`Ordem de Serviço com ID ${id} não encontrada.`);
      }

      const currentStatus = workOrder.status;

      // 2. Se o status já for o mesmo, operação idempotente
      if (currentStatus === targetStatus) {
        return workOrder;
      }

      // O faturamento tem fluxo próprio (forma de pagamento, lançamento no caixa e valores congelados)
      if (targetStatus === WorkOrderStatus.BILLED) {
        throw new BadRequestException('Para faturar a OS, use "Registrar pagamento".');
      }

      // 3. Validação da transição na máquina de estados
      const allowed = this.allowedTransitions[currentStatus];
      if (!allowed || !allowed.includes(targetStatus)) {
        throw new BadRequestException(
          `Transição de status inválida: Não é permitido mudar de "${currentStatus}" para "${targetStatus}".`,
        );
      }

      const updateData: Prisma.WorkOrderUpdateInput = {
        status: targetStatus,
      };

      // 4. Regra de Negócio: Finalização física da OS
      if (targetStatus === WorkOrderStatus.COMPLETED) {
        updateData.finishedAt = new Date();
      }

      // 4.1 Saindo de "Aguardando Peças": as peças precisam estar no estoque agora
      if (
        currentStatus === WorkOrderStatus.WAITING_PARTS &&
        (targetStatus === WorkOrderStatus.APPROVED || targetStatus === WorkOrderStatus.IN_PROGRESS) &&
        !workOrder.stockReserved
      ) {
        try {
          await reserveWorkOrderStock(tx, workOrder, actor.name);
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            throw new BadRequestException(`As peças ainda não chegaram ao estoque: ${shortageText(err.shortages)}.`);
          }
          throw err;
        }
        updateData.stockReserved = true;
        await tx.systemAlert.updateMany({
          where: { workOrderId: id, type: AlertType.STOCK_SHORTAGE, resolvedAt: null },
          data: { resolvedAt: new Date() },
        });
      }

      // 5. Regra de Negócio: Cancelamento e devolução atômica das peças ao estoque
      if (targetStatus === WorkOrderStatus.CANCELLED) {
        // Peças já baixadas e não usadas (OS não concluída) voltam ao estoque
        if (workOrder.stockReserved && currentStatus !== WorkOrderStatus.COMPLETED) {
          await returnWorkOrderStock(tx, workOrder, `Devolução pelo cancelamento da OS #${workOrder.code}`, actor.name);
          updateData.stockReserved = false;
        }
        updateData.cancelledAt = new Date();
        if (reason) {
          updateData.cancelReason = reason;
          const previousNotes = workOrder.technicalNotes ? `${workOrder.technicalNotes}\n` : '';
          updateData.technicalNotes = `${previousNotes}[Cancelamento]: ${reason}`;
        }
        await tx.systemAlert.updateMany({ where: { workOrderId: id, resolvedAt: null }, data: { resolvedAt: new Date() } });
      }

      // 6. Atualização da OS
      const updatedWorkOrder = await tx.workOrder.update({
        where: { id },
        data: updateData,
        include: {
          client: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { id: true, licensePlate: true, model: true } },
          items: true,
        },
      });

      return updatedWorkOrder;
    });
  }

  // ==========================================
  // APROVAÇÃO (com baixa de estoque)
  // ==========================================

  /**
   * Aprova a OS. Equipe: só Administrador, Gerente Geral e Auxiliar Administrativo (403 para os demais).
   * Cliente: só o orçamento (QUOTE) da própria OS.
   * Com todas as peças em estoque: baixa atômica e status APPROVED. Faltando qualquer peça: nada sai do
   * estoque, a OS vai para WAITING_PARTS, com nota técnica e alerta no Dashboard.
   */
  async approve(id: string, actor: WorkOrderActor): Promise<ApprovalResult> {
    if (actor.kind === 'staff' && !(actor.profile && APPROVER_PROFILES.includes(actor.profile))) {
      throw new ForbiddenException('Somente Administrador, Gerente Geral ou Auxiliar Administrativo podem aprovar a OS.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Trava a linha: duas aprovações simultâneas da mesma OS não baixam o estoque duas vezes
        await tx.$queryRaw`SELECT id FROM "work_orders" WHERE id = ${id}::uuid FOR UPDATE`;
        const wo = await tx.workOrder.findUnique({ where: { id }, include: { items: true } });
        if (!wo) throw new NotFoundException(`Ordem de Serviço com ID ${id} não encontrada.`);
        if (wo.status === WorkOrderStatus.APPROVED) return { id, code: wo.code, status: wo.status, shortages: [] };

        const approvable: WorkOrderStatus[] =
          actor.kind === 'client' ? [WorkOrderStatus.QUOTE] : [WorkOrderStatus.DRAFT, WorkOrderStatus.QUOTE, WorkOrderStatus.WAITING_PARTS];
        if (!approvable.includes(wo.status)) {
          throw new BadRequestException(`Não é possível aprovar uma OS com status "${wo.status}".`);
        }

        if (!wo.stockReserved) await reserveWorkOrderStock(tx, wo, actor.name);
        await tx.workOrder.update({
          where: { id },
          data: { status: WorkOrderStatus.APPROVED, stockReserved: true, budgetStatus: BudgetStatus.APPROVED },
        });
        await tx.systemAlert.updateMany({
          where: { workOrderId: id, type: AlertType.STOCK_SHORTAGE, resolvedAt: null },
          data: { resolvedAt: new Date() },
        });
        return { id, code: wo.code, status: WorkOrderStatus.APPROVED, shortages: [] };
      });
    } catch (err) {
      if (!(err instanceof InsufficientStockError)) throw err;
      return this.markWaitingParts(id, err.shortages, actor);
    }
  }

  /** Falta de peça na aprovação: OS em Aguardando Peças + nota técnica + alerta (sem baixar nada). */
  private async markWaitingParts(id: string, shortages: StockShortage[], actor: WorkOrderActor): Promise<ApprovalResult> {
    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({ where: { id } });
      if (!wo) throw new NotFoundException('Ordem de Serviço não encontrada.');
      const text = shortageText(shortages);
      const previousNotes = wo.technicalNotes ? `${wo.technicalNotes}\n` : '';
      await tx.workOrder.update({
        where: { id },
        data: {
          status: WorkOrderStatus.WAITING_PARTS,
          budgetStatus: BudgetStatus.APPROVED,
          technicalNotes: `${previousNotes}[Falta de peças na aprovação por ${actor.name}]: ${text}`,
        },
      });
      await tx.systemAlert.updateMany({
        where: { workOrderId: id, type: AlertType.STOCK_SHORTAGE, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
      await tx.systemAlert.create({
        data: { type: AlertType.STOCK_SHORTAGE, workOrderId: id, message: `OS #${wo.code} aguardando peças: ${text}`.slice(0, 500) },
      });
      return { id, code: wo.code, status: WorkOrderStatus.WAITING_PARTS, shortages };
    });
  }

  // ==========================================
  // CANCELAMENTO
  // ==========================================

  /**
   * Cancela a OS com motivo obrigatório.
   * OS faturada (BILLED): só o Administrador, com confirmação. O caixa e o estoque NÃO são revertidos:
   * fica uma pendência de estorno manual no Financeiro para auditoria.
   */
  async cancel(id: string, dto: CancelWorkOrderDto, actor: WorkOrderActor & { kind: 'staff' }) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, select: { status: true, code: true, technicalNotes: true } });
    if (!wo) throw new NotFoundException(`Ordem de Serviço com ID ${id} não encontrada.`);

    if (wo.status !== WorkOrderStatus.BILLED) {
      const updated = await this.updateStatus(id, { status: WorkOrderStatus.CANCELLED, reason: dto.reason }, actor);
      return { id, code: wo.code, status: updated?.status ?? WorkOrderStatus.CANCELLED, refundPending: false };
    }

    if (actor.profile !== StaffProfile.ADMINISTRADOR) {
      throw new ForbiddenException('Somente o Administrador pode cancelar uma OS já faturada.');
    }
    if (dto.confirm !== true) {
      throw new BadRequestException('Confirme o cancelamento da OS faturada (o estorno de valores e peças será manual).');
    }

    const previousNotes = wo.technicalNotes ? `${wo.technicalNotes}\n` : '';
    // Condicionado ao status: duas requisições não geram duas pendências
    const res = await this.prisma.workOrder.updateMany({
      where: { id, status: WorkOrderStatus.BILLED },
      data: {
        status: WorkOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
        refundStatus: RefundStatus.PENDING,
        technicalNotes: `${previousNotes}[Cancelamento de OS faturada por ${actor.name}]: ${dto.reason} (estorno pendente)`,
      },
    });
    if (res.count !== 1) throw new ConflictException('Esta OS já foi alterada por outra pessoa. Atualize a tela.');
    return { id, code: wo.code, status: WorkOrderStatus.CANCELLED, refundPending: true };
  }

  // ==========================================
  // FATURAMENTO (registro do pagamento)
  // ==========================================

  /**
   * Registra o pagamento de uma OS concluída: muda para BILLED, lança a entrada no caixa e
   * congela a alíquota de ISS e a comissão do mecânico vigentes na data.
   */
  async bill(id: string, dto: BillWorkOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({ where: { id } });
      if (!wo) throw new NotFoundException('Ordem de Serviço não encontrada.');
      if (wo.status !== WorkOrderStatus.COMPLETED) {
        throw new BadRequestException('Só é possível registrar o pagamento de uma OS concluída.');
      }

      const operator = await tx.user.findUnique({ where: { id: dto.operatorId } });
      if (!operator || operator.role === UserRole.CLIENT || !operator.isActive) {
        throw new BadRequestException('Mecânico responsável não encontrado ou inativo.');
      }

      const gross = wo.totalServices.add(wo.totalProducts);
      const discount = dto.discount !== undefined ? new Prisma.Decimal(dto.discount) : wo.discount;
      // Desconto só nas peças (regra da oficina)
      if (discount.gt(wo.totalProducts)) throw new BadRequestException(discountMessage(wo.totalProducts));
      const finalAmount = gross.sub(discount);

      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      if (paidAt.getTime() > Date.now() + 5 * 60000) throw new BadRequestException('A data do pagamento não pode ser futura.');
      if (paidAt < wo.createdAt) throw new BadRequestException('A data do pagamento não pode ser anterior à abertura da OS.');

      const installments = dto.paymentMethod === PaymentMethod.CREDIT_CARD ? (dto.installments ?? 1) : null;
      const settings = await tx.financialSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

      // Atualização condicionada ao status: impede faturar a mesma OS duas vezes
      const updated = await tx.workOrder.updateMany({
        where: { id, status: WorkOrderStatus.COMPLETED },
        data: {
          status: WorkOrderStatus.BILLED,
          billedAt: paidAt,
          paymentMethod: dto.paymentMethod,
          installments,
          discount,
          finalAmount,
          operatorId: operator.id,
          issRate: settings.issRate,
          commissionRate: COMMISSION_RATE, // comissão fixa de 50% sobre a mão de obra
          finishedAt: wo.finishedAt ?? paidAt,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Esta OS já foi faturada por outra pessoa.');

      await tx.cashTransaction.create({
        data: {
          workOrderId: id,
          type: TransactionType.INCOME,
          category: 'FATURAMENTO_OS',
          amount: finalAmount,
          paymentMethod: dto.paymentMethod,
          installments,
          status: TransactionStatus.PAID,
          paidAt,
          description: `Recebimento da OS #${wo.code}`,
          notes: dto.notes || null,
        },
      });

      return tx.workOrder.findUnique({ where: { id }, select: { id: true, code: true, status: true, billedAt: true, finalAmount: true } });
    });
  }

  /** Estorno do faturamento (só gestores): volta para Concluída e cancela a entrada no caixa. */
  async reverseBilling(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({ where: { id } });
      if (!wo) throw new NotFoundException('Ordem de Serviço não encontrada.');
      if (wo.status !== WorkOrderStatus.BILLED) throw new BadRequestException('Só é possível estornar uma OS faturada.');

      await tx.cashTransaction.updateMany({
        where: { workOrderId: id, type: TransactionType.INCOME, status: { not: TransactionStatus.CANCELLED } },
        data: { status: TransactionStatus.CANCELLED, notes: `Estornado: ${reason}` },
      });
      const previousNotes = wo.technicalNotes ? `${wo.technicalNotes}\n` : '';
      await tx.workOrder.update({
        where: { id },
        data: {
          status: WorkOrderStatus.COMPLETED,
          billedAt: null,
          paymentMethod: null,
          installments: null,
          issRate: null,
          commissionRate: null,
          technicalNotes: `${previousNotes}[Estorno do faturamento]: ${reason}`,
        },
      });
      return { reversed: true };
    });
  }

  /** Equipe ativa para escolher o mecânico responsável. */
  listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: [UserRole.ADMIN, UserRole.OPERATOR] }, isActive: true },
      select: { id: true, name: true, profile: true },
      orderBy: { name: 'asc' },
    });
  }

  // ==========================================
  // MECÂNICO RESPONSÁVEL
  // ==========================================

  /** Mecânicos ativos (Mecânico e Mecânico Chefe), para os seletores e filtros. */
  listMechanics() {
    return this.prisma.user.findMany({
      where: { role: { not: UserRole.CLIENT }, profile: { in: MECHANIC_PROFILES }, isActive: true },
      select: { id: true, name: true, profile: true },
      orderBy: { name: 'asc' },
    });
  }

  private async assertActiveMechanic(db: Prisma.TransactionClient | PrismaService, id: string) {
    const m = await db.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, profile: true, isActive: true } });
    if (!m || m.role === UserRole.CLIENT || !m.profile || !MECHANIC_PROFILES.includes(m.profile) || !m.isActive) {
      throw new BadRequestException('Mecânico não encontrado, inativo ou sem cargo de mecânico.');
    }
    return m;
  }

  /**
   * Atribui ou troca o mecânico responsável (só Administrador e Gerente Geral; OS não faturada nem cancelada).
   * Grava a troca nas observações da OS na mesma transação.
   */
  async assignOperator(id: string, operatorId: string, user: { id: string; name: string; role: string; profile: StaffProfile | null }) {
    if (!isPrivileged(user)) {
      throw new ForbiddenException('Só Administrador e Gerente Geral podem atribuir ou trocar o mecânico.');
    }
    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id },
        select: { id: true, status: true, operatorId: true, operator: { select: { name: true } } },
      });
      if (!wo) throw new NotFoundException('Ordem de Serviço não encontrada.');
      if (wo.status === WorkOrderStatus.BILLED) {
        throw new ConflictException('Esta OS já foi faturada: o mecânico não pode mais ser trocado.');
      }
      if (wo.status === WorkOrderStatus.CANCELLED) {
        throw new ConflictException('Esta OS está cancelada: o mecânico não pode mais ser trocado.');
      }
      if (wo.operatorId === operatorId) {
        throw new BadRequestException('Este mecânico já é o responsável pela OS.');
      }
      const mechanic = await this.assertActiveMechanic(tx, operatorId);

      // Condicionada ao mecânico e ao status lidos: duas trocas ao mesmo tempo não se sobrepõem
      const updated = await tx.workOrder.updateMany({
        where: {
          id,
          operatorId: wo.operatorId,
          status: { notIn: [WorkOrderStatus.BILLED, WorkOrderStatus.CANCELLED] },
        },
        data: { operatorId: mechanic.id },
      });
      if (updated.count !== 1) throw new ConflictException('A OS mudou enquanto você editava. Atualize a página e tente de novo.');

      const previous = wo.operator?.name ?? 'Sem mecânico';
      await tx.workOrderObservation.create({
        data: {
          workOrderId: id,
          authorId: user.id,
          authorName: user.name,
          authorRole: observationRole(user),
          type: ObservationType.ATRIBUICAO_MECANICO,
          message: `Mecânico alterado de ${previous} para ${mechanic.name} por ${user.name}.`,
        },
      });
      return { id, operator: { id: mechanic.id, name: mechanic.name }, previousOperatorId: wo.operatorId };
    });
  }

  /**
   * Troca o mecânico de um serviço da OS (só Administrador e Gerente Geral; OS não faturada nem
   * cancelada). `null` devolve o serviço ao responsável da OS. Grava a troca nas observações.
   */
  async assignItemMechanic(
    id: string,
    itemId: string,
    mechanicId: string | null,
    user: { id: string; name: string; role: string; profile: StaffProfile | null },
  ) {
    if (!isPrivileged(user)) {
      throw new ForbiddenException('Só Administrador e Gerente Geral podem trocar o mecânico de um serviço.');
    }
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.workOrderItem.findFirst({
        where: { id: itemId, workOrderId: id },
        select: {
          id: true,
          itemType: true,
          mechanicId: true,
          mechanic: { select: { name: true } },
          service: { select: { name: true } },
          workOrder: { select: { status: true, operatorId: true, operator: { select: { name: true } } } },
        },
      });
      if (!item) throw new NotFoundException('Serviço não encontrado nesta OS.');
      if (item.itemType !== WorkOrderItemType.SERVICE) throw new BadRequestException('Só serviços recebem mecânico; peças não.');
      const { status } = item.workOrder;
      if (status === WorkOrderStatus.BILLED) throw new ConflictException('Esta OS já foi faturada: o mecânico não pode mais ser trocado.');
      if (status === WorkOrderStatus.CANCELLED) throw new ConflictException('Esta OS está cancelada: o mecânico não pode mais ser trocado.');
      if ((item.mechanicId ?? null) === mechanicId) throw new BadRequestException('Este mecânico já está neste serviço.');
      const mechanic = mechanicId ? await this.assertActiveMechanic(tx, mechanicId) : null;

      // Condicionada ao mecânico e ao status lidos: duas trocas ao mesmo tempo não se sobrepõem
      const updated = await tx.workOrderItem.updateMany({
        where: {
          id: itemId,
          mechanicId: item.mechanicId,
          workOrder: { status: { notIn: [WorkOrderStatus.BILLED, WorkOrderStatus.CANCELLED] } },
        },
        data: { mechanicId: mechanic?.id ?? null },
      });
      if (updated.count !== 1) throw new ConflictException('A OS mudou enquanto você editava. Atualize a página e tente de novo.');

      const responsible = item.workOrder.operator?.name;
      const label = (name: string | undefined, own: boolean) =>
        own ? name! : responsible ? `${responsible} (responsável)` : 'sem mecânico';
      const previous = label(item.mechanic?.name, !!item.mechanicId);
      const next = label(mechanic?.name, !!mechanic);
      await tx.workOrderObservation.create({
        data: {
          workOrderId: id,
          authorId: user.id,
          authorName: user.name,
          authorRole: observationRole(user),
          type: ObservationType.ATRIBUICAO_MECANICO,
          message: `Serviço "${item.service?.name ?? 'Serviço'}": mecânico alterado de ${previous} para ${next} por ${user.name}.`,
        },
      });
      return { id: itemId, mechanic: mechanic ? { id: mechanic.id, name: mechanic.name } : null };
    });
  }

  // ==========================================
  // OBSERVAÇÕES
  // ==========================================

  /** Histórico de observações da OS (orçamento, técnicas e reaberturas), da mais antiga para a mais nova. */
  listObservations(id: string) {
    return this.prisma.workOrderObservation.findMany({
      where: { workOrderId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, authorName: true, authorRole: true, type: true, message: true, createdAt: true },
    });
  }
}
