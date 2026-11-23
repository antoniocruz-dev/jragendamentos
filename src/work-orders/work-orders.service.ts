import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { UpdateWorkOrderStatusDto } from './dto/update-status.dto.js';
import { CustomerDecisionDto } from './dto/customer-decision.dto.js';
import { WorkOrderStatus, WorkOrderItemType, Prisma } from '@prisma/client';

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

  async findById(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        client: true,
        vehicle: true,
        operator: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            service: true,
            product: true,
          },
        },
        transactions: true,
      },
    });

    if (!workOrder) {
      throw new NotFoundException(`Ordem de Serviço com ID ${id} não encontrada.`);
    }

    return workOrder;
  }

  async listAll(status?: WorkOrderStatus) {
    return this.prisma.workOrder.findMany({
      where: status ? { status } : undefined,
      include: {
        client: { select: { name: true, phone: true } },
        vehicle: { select: { licensePlate: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
}
