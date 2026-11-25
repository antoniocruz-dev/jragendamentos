import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PortalAccessDto } from './dto/portal-access.dto.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { parsePage, searchTerms, toPage } from '../common/pagination.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { CreateClientWithVehicleDto } from './dto/create-client-with-vehicle.dto.js';

const WORK_ORDER_SUMMARY = {
  select: { id: true, code: true, status: true, finalAmount: true, createdAt: true },
  orderBy: { createdAt: 'desc' as const },
};

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientWithVehicleDto) {
    const { vehicle, ...client } = dto;

    await this.assertDocumentFree(client.document);
    if (vehicle) await this.assertPlateFree(vehicle.licensePlate);

    return this.prisma.client.create({
      data: {
        ...client,
        email: client.email || null,
        vehicles: vehicle ? { create: vehicle } : undefined,
      },
      include: { vehicles: true },
    });
  }

  /**
   * Grid de clientes paginado no banco. Busca por nome, CPF/CNPJ, telefone ou placa.
   * Cada veículo traz só a contagem de OS; o histórico é carregado sob demanda.
   */
  async findAll(filters: { q?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip, take } = parsePage(filters.page, filters.pageSize, 12);
    const { text, digits, plate } = searchTerms(filters.q);

    const or: Prisma.ClientWhereInput[] = [];
    if (text) {
      or.push({ name: { contains: text, mode: 'insensitive' } });
      if (digits.length >= 3) or.push({ document: { contains: digits } }, { phone: { contains: digits } });
      if (plate.length >= 2) or.push({ vehicles: { some: { licensePlate: { contains: plate } } } });
    }
    const where: Prisma.ClientWhereInput = or.length ? { OR: or } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: {
          vehicles: {
            include: { _count: { select: { workOrders: true } } },
            orderBy: { createdAt: 'asc' },
          },
          user: { select: { email: true, isActive: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.client.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  /** Lista enxuta para selects (Agendamentos): só o necessário para escolher cliente e veículo. */
  async options() {
    return this.prisma.client.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        vehicles: { select: { id: true, licensePlate: true, brand: true, model: true, year: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** Histórico de OS de um veículo (aberto ao clicar em "OS" no grid). */
  async vehicleWorkOrders(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
    return this.prisma.workOrder.findMany({
      where: { vehicleId },
      ...WORK_ORDER_SUMMARY,
      take: 100,
    });
  }

  async findById(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        vehicles: true,
        workOrders: { take: 5, ...WORK_ORDER_SUMMARY },
      },
    });

    if (!client) {
      throw new NotFoundException(`Cliente com ID ${id} não encontrado.`);
    }

    return client;
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findById(id);
    if (dto.document) await this.assertDocumentFree(dto.document, id);

    return this.prisma.client.update({
      where: { id },
      data: { ...dto, ...(dto.email !== undefined ? { email: dto.email || null } : {}) },
    });
  }

  /**
   * Exclui o cliente e seus veículos. Bloqueado quando já existe histórico
   * (OS ou agendamentos), para não perder dados de faturamento.
   */
  async remove(id: string) {
    await this.findById(id);

    const [workOrders, appointments] = await Promise.all([
      this.prisma.workOrder.count({ where: { clientId: id } }),
      this.prisma.appointment.count({ where: { clientId: id } }),
    ]);
    if (workOrders || appointments) {
      throw new ConflictException(
        `Não é possível excluir: o cliente tem ${workOrders} OS e ${appointments} agendamento(s) no histórico.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.vehicle.deleteMany({ where: { clientId: id } }),
      this.prisma.client.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }

  // ==========================================
  // OPERAÇÕES COM VEÍCULOS
  // ==========================================

  async addVehicle(clientId: string, dto: CreateVehicleDto) {
    await this.findById(clientId);
    await this.assertPlateFree(dto.licensePlate);

    return this.prisma.vehicle.create({
      data: { ...dto, clientId },
    });
  }

  async updateVehicle(vehicleId: string, dto: UpdateVehicleDto) {
    await this.findVehicle(vehicleId);
    if (dto.licensePlate) await this.assertPlateFree(dto.licensePlate, vehicleId);

    return this.prisma.vehicle.update({ where: { id: vehicleId }, data: dto });
  }

  async removeVehicle(vehicleId: string) {
    await this.findVehicle(vehicleId);

    const [workOrders, appointments] = await Promise.all([
      this.prisma.workOrder.count({ where: { vehicleId } }),
      this.prisma.appointment.count({ where: { vehicleId } }),
    ]);
    if (workOrders || appointments) {
      throw new ConflictException(
        `Não é possível excluir: o veículo tem ${workOrders} OS e ${appointments} agendamento(s) no histórico.`,
      );
    }

    await this.prisma.vehicle.delete({ where: { id: vehicleId } });
    return { deleted: true };
  }

  async findVehicleByPlate(licensePlate: string) {
    const sanitizedPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(sanitizedPlate)) {
      throw new BadRequestException('Placa inválida. Use o padrão antigo (ABC1234) ou Mercosul (ABC1D23).');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { licensePlate: sanitizedPlate },
      include: {
        client: {
          select: { id: true, name: true, phone: true, document: true },
        },
        workOrders: {
          orderBy: { createdAt: 'desc' },
          take: 5, // últimas 5 OS
          select: {
            id: true,
            code: true,
            status: true,
            finalAmount: true,
            createdAt: true,
            finishedAt: true,
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Nenhum veículo encontrado com a placa "${sanitizedPlate}".`);
    }

    return vehicle;
  }

  // ==========================================
  // ACESSO AO PORTAL DO CLIENTE
  // ==========================================

  async portalAccess(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { email: true, user: { select: { email: true, isActive: true } } },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado.');
    return { hasAccess: !!client.user?.isActive, email: client.user?.email ?? client.email ?? '', isActive: client.user?.isActive ?? false };
  }

  /** Cria (ou atualiza e reativa) o login do cliente no portal. */
  async grantPortalAccess(clientId: string, dto: PortalAccessDto) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, phone: true, userId: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const taken = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (taken && taken.id !== client.userId) throw new ConflictException('Este e-mail já é usado por outro acesso.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction(async (tx) => {
      if (client.userId) {
        await tx.user.update({ where: { id: client.userId }, data: { email: dto.email, passwordHash, isActive: true } });
      } else {
        const user = await tx.user.create({
          data: { name: client.name, email: dto.email, phone: client.phone, passwordHash, role: UserRole.CLIENT },
        });
        await tx.client.update({ where: { id: clientId }, data: { userId: user.id } });
      }
    });
    return this.portalAccess(clientId);
  }

  /** Bloqueia o login do cliente (o cadastro e o histórico continuam). */
  async revokePortalAccess(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { userId: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');
    if (client.userId) await this.prisma.user.update({ where: { id: client.userId }, data: { isActive: false } });
    return this.portalAccess(clientId);
  }

  // ==========================================
  // VALIDAÇÕES
  // ==========================================

  private async findVehicle(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
    return vehicle;
  }

  private async assertDocumentFree(document: string, ignoreId?: string) {
    const conflict = await this.prisma.client.findFirst({
      where: { document, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });
    if (conflict) {
      throw new ConflictException('Já existe um cliente cadastrado com este documento (CPF/CNPJ).');
    }
  }

  private async assertPlateFree(licensePlate: string, ignoreId?: string) {
    const conflict = await this.prisma.vehicle.findFirst({
      where: { licensePlate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });
    if (conflict) {
      throw new ConflictException(`O veículo com a placa "${licensePlate}" já está cadastrado no sistema.`);
    }
  }
}
