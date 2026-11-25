import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { AppointmentStatus, ObservationType, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientPortal } from '../auth/decorators/client-portal.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { CreateVehicleDto } from '../clients/dto/create-vehicle.dto.js';
import { BudgetDecisionDto, ClientAppointmentDto } from './portal.dto.js';

const VEHICLE_SELECT = { id: true, licensePlate: true, brand: true, model: true, year: true, color: true, currentKm: true } as const;

/**
 * Área do Cliente (papel CLIENT). Toda consulta filtra pelo clientId vinculado ao usuário do token
 * (lido do banco a cada requisição). Registro de outro cliente responde 404, sem revelar que existe.
 * Sem acesso a financeiro, equipe ou catálogo interno: essas rotas exigem a equipe (403).
 */
@ClientPortal()
@Controller('cliente')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
    private readonly appointments: AppointmentsService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: user.clientId! },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        vehicles: { select: VEHICLE_SELECT, orderBy: { createdAt: 'asc' } },
      },
    });
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, client };
  }

  // ==========================================
  // ORDENS DE SERVIÇO
  // ==========================================

  /** O.S dos veículos do cliente (orçamentos e histórico). */
  @Get('os')
  workOrdersList(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.workOrder.findMany({
      where: { clientId: user.clientId!, status: { not: WorkOrderStatus.DRAFT } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        code: true,
        status: true,
        budgetStatus: true,
        finalAmount: true,
        createdAt: true,
        finishedAt: true,
        reportedIssue: true,
        vehicle: { select: { id: true, licensePlate: true, brand: true, model: true } },
      },
    });
  }

  /** Detalhe da própria O.S: itens do orçamento e as observações que o cliente enviou. */
  @Get('os/:id')
  async workOrder(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertOwn(id, user.clientId!);
    const [wo, observations] = await Promise.all([
      this.workOrders.findById(id), // mesmo formato público (sem custos, ISS ou comissões)
      this.prisma.workOrderObservation.findMany({
        where: { workOrderId: id, type: ObservationType.ORCAMENTO_CLIENTE },
        orderBy: { createdAt: 'asc' },
        select: { id: true, authorName: true, type: true, message: true, createdAt: true },
      }),
    ]);
    return { ...wo, observations };
  }

  /** Aprova ou reprova o próprio orçamento. Observação opcional ao aprovar, obrigatória ao reprovar. */
  @Post('os/:id/budget-decision')
  @HttpCode(HttpStatus.OK)
  async decision(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: BudgetDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertOwn(id, user.clientId!);
    await this.workOrders.customerDecision(
      id,
      { decision: dto.decision === 'APROVADO' ? 'APPROVE' : 'REJECT', reason: dto.observation },
      { id: user.id, name: user.name },
    );
    return this.workOrder(id, user);
  }

  // ==========================================
  // VEÍCULOS E AGENDAMENTO
  // ==========================================

  @Get('vehicles')
  vehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.vehicle.findMany({ where: { clientId: user.clientId! }, select: VEHICLE_SELECT, orderBy: { createdAt: 'asc' } });
  }

  /** O cliente cadastra outro veículo dele (a placa não pode existir em outro cadastro). */
  @Post('vehicles')
  async addVehicle(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const taken = await this.prisma.vehicle.findUnique({ where: { licensePlate: dto.licensePlate }, select: { id: true } });
    if (taken) throw new ConflictException('Esta placa já está cadastrada. Fale com a oficina se o veículo é seu.');
    return this.prisma.vehicle.create({
      data: {
        clientId: user.clientId!,
        licensePlate: dto.licensePlate,
        brand: dto.brand.trim(),
        model: dto.model.trim(),
        year: dto.year,
        color: dto.color?.trim() || null,
      },
      select: VEHICLE_SELECT,
    });
  }

  /** Horários livres do dia (sem revelar de quem são os ocupados). */
  @Get('slots')
  slots(@Query('date') date: string) {
    return this.appointments.availableSlots(date ?? '');
  }

  @Get('appointments')
  myAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.appointment.findMany({
      where: { clientId: user.clientId!, scheduledFor: { gte: new Date(Date.now() - 30 * 86400_000) } },
      orderBy: { scheduledFor: 'desc' },
      take: 30,
      select: {
        id: true,
        scheduledFor: true,
        status: true,
        serviceType: true,
        notes: true,
        vehicle: { select: { id: true, licensePlate: true, brand: true, model: true } },
      },
    });
  }

  @Post('appointments')
  async schedule(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: ClientAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, clientId: user.clientId! }, select: { id: true } });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado.');
    const scheduledFor = new Date(`${dto.date}T${dto.time}:00-03:00`);
    if (Number.isNaN(scheduledFor.getTime())) throw new BadRequestException('Data ou horário inválido.');
    try {
      const created = await this.appointments.create({
        clientId: user.clientId!,
        vehicleId: vehicle.id,
        scheduledFor: scheduledFor.toISOString(),
        serviceType: dto.serviceType,
        notes: dto.notes,
      });
      return { id: created.id, scheduledFor: created.scheduledFor, status: created.status, serviceType: created.serviceType };
    } catch (err) {
      // Não repassa a placa de outro cliente que ocupa o horário
      if (err instanceof ConflictException) throw new ConflictException('Horário indisponível. Escolha outro horário.');
      throw err;
    }
  }

  /** O cliente desmarca o próprio agendamento (pendente ou confirmado). */
  @Patch('appointments/:id/cancel')
  async cancelAppointment(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, clientId: user.clientId! }, select: { id: true } });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    const updated = await this.appointments.updateStatus(id, { status: AppointmentStatus.CANCELLED, reason: 'Desmarcado pelo cliente' });
    return { id: updated.id, status: updated.status };
  }

  private async assertOwn(id: string, clientId: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, clientId, status: { not: WorkOrderStatus.DRAFT } }, select: { id: true } });
    if (!wo) throw new NotFoundException('Ordem de Serviço não encontrada.');
  }
}
