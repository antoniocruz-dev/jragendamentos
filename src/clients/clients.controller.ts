import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    return this.prisma.client.findMany({
      include: {
        vehicles: {
          include: {
            workOrders: {
              select: {
                id: true,
                code: true,
                status: true,
                finalAmount: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async createClientWithVehicle(@Body() body: any) {
    const { name, document, phone, email, vehicle } = body;
    return this.prisma.client.create({
      data: {
        name,
        document,
        phone,
        email: email || null,
        vehicles: vehicle
          ? {
              create: {
                brand: vehicle.brand,
                model: vehicle.model,
                year: Number(vehicle.year),
                licensePlate: vehicle.licensePlate.toUpperCase().trim(),
                currentKm: vehicle.currentKm ? Number(vehicle.currentKm) : null,
              },
            }
          : undefined,
      },
      include: {
        vehicles: true,
      },
    });
  }

  @Post(':id/vehicles')
  async addVehicleToClient(@Param('id') clientId: string, @Body() body: any) {
    return this.prisma.vehicle.create({
      data: {
        clientId,
        brand: body.brand,
        model: body.model,
        year: Number(body.year),
        licensePlate: body.licensePlate.toUpperCase().trim(),
        currentKm: body.currentKm ? Number(body.currentKm) : null,
      },
    });
  }
}
