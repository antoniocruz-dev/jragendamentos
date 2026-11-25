import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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
} from '@prisma/client';
import { BillWorkOrderDto } from '../financial/dto/financial.dto.js';

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkOrderDto) {
    const { clientId, vehicleId, operatorId, reportedIssue, technicalNotes, items } = dto;

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

          // Verificação de saldo de estoque
          if (product.stockQuantity < item.quantity) {
            throw new BadRequestException(
              `Estoque insuficiente para a peça "${product.name}". Disponível: ${product.stockQuantity}, Requisitado: ${item.quantity}.`,
            );
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

          // Baixa atômica no estoque da peça
          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      const finalAmount = totalServices.add(totalProducts);

      // 3. Criação da Ordem de Serviço com itens vinculados
      const workOrder = await tx.workOrder.create({
        data: {
          clientId,
          vehicleId,
          operatorId,
          reportedIssue,
          technicalNotes,
          status: WorkOrderStatus.QUOTE, // Inicia como orçamento por padrão
          totalServices,
          totalProducts,
          discount: new Prisma.Decimal(0.00),
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
  async listAll(filters: { status?: string; q?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip, take } = parsePage(filters.page, filters.pageSize);
    const { text, digits, plate } = searchTerms(filters.q);

    const or: Prisma.WorkOrderWhereInput[] = [];
    if (text) {
      or.push({ client: { name: { contains: text, mode: 'insensitive' } } });
      if (plate.length >= 2) or.push({ vehicle: { licensePlate: { contains: plate } } });
      if (digits && digits.length <= 9 && digits === text.replace(/^#/, '')) or.push({ code: Number(digits) });
    }
    const searchWhere: Prisma.WorkOrderWhereInput = or.length ? { OR: or } : {};

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
      WorkOrderStatus.COMPLETED,
      WorkOrderStatus.CANCELLED,
    ],
    [WorkOrderStatus.WAITING_PARTS]: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.COMPLETED]: [WorkOrderStatus.BILLED],
    [WorkOrderStatus.BILLED]: [], // Estado final
    [WorkOrderStatus.CANCELLED]: [], // Estado final
  };

  /** Decisão do cliente sobre o orçamento (rota pública). Só vale para OS em QUOTE. */
  async customerDecision(id: string, dto: CustomerDecisionDto) {
    const workOrder = await this.findById(id);

    if (workOrder.status !== WorkOrderStatus.QUOTE) {
      throw new BadRequestException('Este orçamento não está mais aguardando aprovação.');
    }

    await this.updateStatus(id, {
      status: dto.decision === 'APPROVE' ? WorkOrderStatus.APPROVED : WorkOrderStatus.CANCELLED,
      reason: dto.decision === 'REJECT' ? `Recusado pelo cliente${dto.reason ? `: ${dto.reason}` : ''}` : undefined,
    });

    // Retorna o mesmo formato detalhado usado pela página da OS
    return this.findById(id);
  }

  async updateStatus(id: string, dto: UpdateWorkOrderStatusDto) {
    const { status: targetStatus, reason } = dto;

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

      // 5. Regra de Negócio: Cancelamento e estorno atômico de estoque
      if (targetStatus === WorkOrderStatus.CANCELLED) {
        // Se a OS for cancelada antes de ser concluída, devolvemos as peças ao estoque
        const shouldRestock = currentStatus !== WorkOrderStatus.COMPLETED;

        if (shouldRestock) {
          for (const item of workOrder.items) {
            if (item.itemType === WorkOrderItemType.PRODUCT && item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: {
                  stockQuantity: {
                    increment: item.quantity,
                  },
                },
              });
            }
          }
        }

        // Anexa o motivo do cancelamento às notas técnicas
        if (reason) {
          const previousNotes = workOrder.technicalNotes ? `${workOrder.technicalNotes}\n` : '';
          updateData.technicalNotes = `${previousNotes}[Cancelamento]: ${reason}`;
        }
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
      if (discount.gt(gross)) throw new BadRequestException('O desconto não pode ser maior que o valor da OS.');
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
          commissionRate: operator.commissionRate,
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
}
