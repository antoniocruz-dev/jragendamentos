import { StaffProfile } from '@prisma/client';
import { ConflictException, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto, CreateServiceDto, UpdateProductDto, UpdateServiceDto, StockAdjustmentDto } from './dto/catalog.dto.js';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Serviços ----------

  listServices(includeInactive: boolean) {
    return this.prisma.service.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { _count: { select: { items: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  createService(dto: CreateServiceDto) {
    return this.prisma.service.create({ data: dto });
  }

  async updateService(id: string, dto: UpdateServiceDto) {
    await this.findService(id);
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async setServiceActive(id: string, isActive: boolean) {
    await this.findService(id);
    return this.prisma.service.update({ where: { id }, data: { isActive } });
  }

  /** Só exclui serviços nunca usados em OS; os demais devem ser inativados. */
  async removeService(id: string) {
    await this.findService(id);
    const used = await this.prisma.workOrderItem.count({ where: { serviceId: id } });
    if (used) {
      throw new ConflictException(
        `Este serviço aparece em ${used} item(ns) de OS e não pode ser excluído. Inative-o para tirá-lo das novas OS.`,
      );
    }
    await this.prisma.service.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------- Peças ----------

  listProducts(includeInactive: boolean) {
    return this.prisma.product.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { _count: { select: { items: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async createProduct(dto: CreateProductDto) {
    await this.assertSkuFree(dto.sku);
    return this.prisma.product.create({ data: { ...dto, sku: dto.sku.trim().toUpperCase() } });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.findProduct(id);
    if (dto.sku) await this.assertSkuFree(dto.sku, id);
    return this.prisma.product.update({
      where: { id },
      data: { ...dto, ...(dto.sku ? { sku: dto.sku.trim().toUpperCase() } : {}) },
    });
  }

  /**
   * Movimentação manual (entrada/saída) em transação. Uma saída que deixaria o estoque negativo
   * é recusada, a menos que o Administrador autorize (allowNegative).
   */
  async adjustStock(id: string, dto: StockAdjustmentDto, user: { name: string; profile: StaffProfile | null }) {
    const allowNegative = dto.allowNegative === true;
    if (allowNegative && user.profile !== StaffProfile.ADMINISTRADOR) {
      throw new ForbiddenException('Somente o Administrador pode autorizar estoque negativo.');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.findProduct(id);
      // UPDATE condicional: a checagem e a baixa acontecem juntas (sem corrida entre duas saídas)
      const res = await tx.product.updateMany({
        where: { id, ...(dto.quantity < 0 && !allowNegative ? { stockQuantity: { gte: -dto.quantity } } : {}) },
        data: { stockQuantity: { increment: dto.quantity } },
      });
      const product = await tx.product.findUniqueOrThrow({ where: { id } });
      if (res.count === 0) {
        throw new BadRequestException(
          `Saída de ${-dto.quantity} un. deixaria o estoque negativo (saldo atual: ${product.stockQuantity}). Só o Administrador pode autorizar.`,
        );
      }
      await tx.stockMovement.create({
        data: { productId: id, quantity: dto.quantity, balance: product.stockQuantity, reason: dto.reason.trim(), userName: user.name },
      });
      return product;
    });
  }

  /** Últimas movimentações da peça. */
  stockMovements(id: string) {
    return this.prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, quantity: true, balance: true, reason: true, userName: true, createdAt: true, workOrder: { select: { id: true, code: true } } },
    });
  }

  async setProductActive(id: string, isActive: boolean) {
    await this.findProduct(id);
    return this.prisma.product.update({ where: { id }, data: { isActive } });
  }

  async removeProduct(id: string) {
    await this.findProduct(id);
    const used = await this.prisma.workOrderItem.count({ where: { productId: id } });
    if (used) {
      throw new ConflictException(
        `Esta peça aparece em ${used} item(ns) de OS e não pode ser excluída. Inative-a para tirá-la das novas OS.`,
      );
    }
    await this.prisma.product.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------- Auxiliares ----------

  private async findService(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Serviço não encontrado.');
    return service;
  }

  private async findProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Peça não encontrada.');
    return product;
  }

  private async assertSkuFree(sku: string, ignoreId?: string) {
    const conflict = await this.prisma.product.findFirst({
      where: { sku: sku.trim().toUpperCase(), ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });
    if (conflict) throw new ConflictException(`Já existe uma peça com o código "${sku}".`);
  }
}
