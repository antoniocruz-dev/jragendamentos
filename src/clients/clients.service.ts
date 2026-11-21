import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto) {
    const existing = await this.prisma.client.findUnique({
      where: { document: dto.document },
    });

    if (existing) {
      throw new ConflictException('Já existe um cliente cadastrado com este documento (CPF/CNPJ).');
    }

    return this.prisma.client.create({
      data: dto,
    });
  }

  async findAll(search?: string) {
    return this.prisma.client.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { document: { contains: search.replace(/\D/g, '') } },
              { phone: { contains: search.replace(/\D/g, '') } },
            ],
          }
        : undefined,
      include: {
        vehicles: {
          select: {
            id: true,
            licensePlate: true,
            brand: true,
            model: true,
            year: true,
            currentKm: true,
          },
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
        workOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            code: true,
            status: true,
            finalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Cliente com ID ${id} não encontrado.`);
    }

    return client;
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findById(id); // Garante existência prévia

    if (dto.document) {
      const documentConflict = await this.prisma.client.findFirst({
        where: {
          document: dto.document,
          NOT: { id },
        },
      });

      if (documentConflict) {
        throw new ConflictException('O documento informado já está em uso por outro cliente.');
      }
    }

    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  // ==========================================
  // OPERAÇÕES COM VEÍCULOS
  // ==========================================

  async addVehicle(clientId: string, dto: CreateVehicleDto) {
    await this.findById(clientId); // Valida se o cliente existe

    const existingVehicle = await this.prisma.vehicle.findUnique({
      where: { licensePlate: dto.licensePlate },
    });

    if (existingVehicle) {
      throw new ConflictException(`O veículo com a placa "${dto.licensePlate}" já está cadastrado no sistema.`);
    }

    return this.prisma.vehicle.create({
      data: {
        ...dto,
        clientId,
      },
    });
  }

  async findVehicleByPlate(licensePlate: string) {
    const sanitizedPlate = licensePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { licensePlate: sanitizedPlate },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            phone: true,
            document: true,
          },
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
}
