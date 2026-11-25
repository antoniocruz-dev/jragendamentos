import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { SLOT_MINUTES, outsideBusinessHours } from '../common/business-hours.js';
import { UpdateAppointmentDto } from './dto/update-appointment.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

const APPOINTMENT_INCLUDE = {
  client: { select: { id: true, name: true, phone: true, document: true } },
  vehicle: {
    select: { id: true, licensePlate: true, brand: true, model: true, year: true },
  },
} satisfies Prisma.AppointmentInclude;

export interface ListAppointmentsFilters {
  from?: string;
  to?: string;
  status?: AppointmentStatus;
  clientId?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Máquina de estados do agendamento. */
  private readonly allowedTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
    [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
    [AppointmentStatus.CONFIRMED]: [
      AppointmentStatus.ATTENDED,
      AppointmentStatus.PENDING,
      AppointmentStatus.CANCELLED,
    ],
    [AppointmentStatus.ATTENDED]: [], // Estado final
    [AppointmentStatus.CANCELLED]: [], // Estado final
  };

  async create(dto: CreateAppointmentDto) {
    const { clientId, vehicleId, notes } = dto;
    const scheduledFor = this.parseFutureDate(dto.scheduledFor);

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new NotFoundException('Veículo não encontrado.');
    }
    if (vehicle.clientId !== clientId) {
      throw new BadRequestException('O veículo informado não pertence ao cliente indicado.');
    }

    // Trava rígida: 1 veículo por horário. O lock serializa agendamentos simultâneos;
    // quem chega depois encontra o horário ocupado e recebe 409.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('appointments_slots'))`;
      await this.assertSlotFree(tx, scheduledFor);
      return tx.appointment.create({
        data: { clientId, vehicleId, scheduledFor, notes: notes?.trim() || null },
        include: APPOINTMENT_INCLUDE,
      });
    });
  }

  async listAll(filters: ListAppointmentsFilters = {}) {
    const where: Prisma.AppointmentWhereInput = {};

    const scheduledFor: Prisma.DateTimeFilter = {};
    if (filters.from) scheduledFor.gte = this.parseDate(filters.from, 'from');
    if (filters.to) scheduledFor.lte = this.parseDate(filters.to, 'to');
    if (filters.from || filters.to) where.scheduledFor = scheduledFor;

    if (filters.status) {
      if (!Object.values(AppointmentStatus).includes(filters.status)) {
        throw new BadRequestException(`Status inválido: ${filters.status}`);
      }
      where.status = filters.status;
    }
    if (filters.clientId) where.clientId = filters.clientId;

    return this.prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async findById(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_INCLUDE,
    });

    if (!appointment) {
      throw new NotFoundException(`Agendamento com ID ${id} não encontrado.`);
    }

    return appointment;
  }

  /** Exclusão definitiva (só gestores). Para desmarcar normalmente, use o status CANCELLED. */
  async remove(id: string) {
    await this.findById(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    const appointment = await this.findById(id);

    if (!ACTIVE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        'Só é possível editar agendamentos pendentes ou confirmados.',
      );
    }

    const data: Prisma.AppointmentUpdateInput = {};
    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim() || null;
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.scheduledFor !== undefined) {
        const scheduledFor = this.parseFutureDate(dto.scheduledFor);
        if (scheduledFor.getTime() !== appointment.scheduledFor.getTime()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('appointments_slots'))`;
          await this.assertSlotFree(tx, scheduledFor, id);
          data.scheduledFor = scheduledFor;
          // Reagendar exige nova confirmação do cliente
          data.status = AppointmentStatus.PENDING;
        }
      }
      return tx.appointment.update({ where: { id }, data, include: APPOINTMENT_INCLUDE });
    });
  }

  async updateStatus(id: string, dto: UpdateAppointmentStatusDto) {
    const { status: targetStatus, reason } = dto;
    const appointment = await this.findById(id);
    const currentStatus = appointment.status;

    if (currentStatus === targetStatus) {
      return appointment; // Idempotente
    }

    const allowed = this.allowedTransitions[currentStatus];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Transição de status inválida: não é permitido mudar de "${currentStatus}" para "${targetStatus}".`,
      );
    }

    const data: Prisma.AppointmentUpdateInput = { status: targetStatus };

    if (targetStatus === AppointmentStatus.CANCELLED && reason?.trim()) {
      const previousNotes = appointment.notes ? `${appointment.notes}\n` : '';
      data.notes = `${previousNotes}[Cancelamento]: ${reason.trim()}`;
    }

    return this.prisma.appointment.update({
      where: { id },
      data,
      include: APPOINTMENT_INCLUDE,
    });
  }

  // ==========================================
  // AUXILIARES
  // ==========================================

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Data inválida em "${field}": ${value}`);
    }
    return date;
  }

  private parseFutureDate(value: string): Date {
    const date = this.parseDate(value, 'scheduledFor');
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('O agendamento deve ser marcado para uma data/hora futura.');
    }
    const closed = outsideBusinessHours(date);
    if (closed) throw new BadRequestException(closed);
    return date;
  }

  /**
   * Cada agendamento ocupa ${SLOT_MINUTES} min. Recusa (409) se houver outro PENDENTE ou CONFIRMADO
   * que se sobreponha a esse intervalo, de qualquer veículo.
   */
  private async assertSlotFree(tx: Prisma.TransactionClient, scheduledFor: Date, ignoreId?: string) {
    const windowMs = SLOT_MINUTES * 60 * 1000;
    const conflict = await tx.appointment.findFirst({
      where: {
        status: { in: ACTIVE_STATUSES },
        scheduledFor: { gt: new Date(scheduledFor.getTime() - windowMs), lt: new Date(scheduledFor.getTime() + windowMs) },
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      include: { vehicle: { select: { licensePlate: true } } },
    });
    if (conflict) {
      const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Belem', hour: '2-digit', minute: '2-digit' }).format(conflict.scheduledFor);
      throw new ConflictException(`Horário indisponível: já existe um agendamento às ${hora} (${conflict.vehicle.licensePlate}). Escolha outro horário.`);
    }
  }
}
