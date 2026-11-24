import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
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

  async findAll() {
    return this.prisma.client.findMany({
      include: {
        vehicles: {
          include: { workOrders: WORK_ORDER_SUMMARY },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
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

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { licensePlate: sanitizedPlate },
      include: {
        client: {
          select: { id: true, name: true, phone: true, document: true },
        },
        workOrders: {
          orderBy: { createdAt: 'desc' },
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
