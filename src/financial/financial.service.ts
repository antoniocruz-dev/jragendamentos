import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionType, TransactionStatus, UserRole, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  COMMISSION_PAYMENT,
  D,
  EXPENSE_CATEGORIES,
  ZERO,
  computeOrder,
  money,
  periodOf,
  localDay,
  type Dec,
  type GroupBy,
} from './financial-calc.js';
import { CreateExpenseDto, UpdateExpenseDto, UpdateSettingsDto } from './dto/financial.dto.js';

export interface ReportFilters {
  from?: string;
  to?: string;
  groupBy?: string;
  mechanicId?: string;
  paymentMethod?: string;
  q?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  CASH: 'Dinheiro',
  BANK_TRANSFER: 'Transferência bancária',
};

const TAX_REGIME_LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
};

function paymentLabel(method: string | null, installments: number | null) {
  if (!method) return 'Não informado';
  if (method === 'CREDIT_CARD') return installments && installments > 1 ? `Cartão de crédito ${installments}x` : 'Cartão de crédito à vista';
  return PAYMENT_LABELS[method] ?? method;
}

function parseDate(value: string | undefined, name: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Data "${name}" inválida.`);
  return d;
}

/** Acumulador de totais (Decimal, sem perda de centavos). */
function emptyTotals() {
  return {
    orders: 0,
    partsSale: ZERO,
    partsCost: ZERO,
    partsProfit: ZERO,
    labor: ZERO,
    discount: ZERO,
    totalBilled: ZERO,
    grossProfit: ZERO,
    iss: ZERO,
    commission: ZERO,
    netResult: ZERO,
  };
}
type Totals = ReturnType<typeof emptyTotals>;
const TOTAL_KEYS = ['partsSale', 'partsCost', 'partsProfit', 'labor', 'discount', 'totalBilled', 'grossProfit', 'iss', 'commission', 'netResult'] as const;

function addTo(t: Totals, f: Record<(typeof TOTAL_KEYS)[number], Dec>) {
  t.orders += 1;
  for (const k of TOTAL_KEYS) t[k] = t[k].add(f[k]);
}
function totalsOut(t: Totals) {
  return { orders: t.orders, ...Object.fromEntries(TOTAL_KEYS.map((k) => [k, money(t[k])])) } as { orders: number } & Record<
    (typeof TOTAL_KEYS)[number],
    number
  >;
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CONFIGURAÇÃO FISCAL
  // ==========================================

  async getSettings() {
    const s = await this.prisma.financialSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    return { ...s, issRate: Number(s.issRate), taxRegimeLabel: TAX_REGIME_LABELS[s.taxRegime] };
  }

  async updateSettings(dto: UpdateSettingsDto) {
    await this.prisma.financialSettings.upsert({ where: { id: 1 }, update: dto, create: { id: 1, ...dto } });
    return this.getSettings();
  }

  // ==========================================
  // RELATÓRIO GERENCIAL
  // ==========================================

  async report(filters: ReportFilters) {
    const now = new Date();
    const from = parseDate(filters.from, 'from') ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = parseDate(filters.to, 'to') ?? now;
    if (from > to) throw new BadRequestException('A data inicial deve ser anterior à final.');
    const groupBy: GroupBy = filters.groupBy === 'week' || filters.groupBy === 'year' ? filters.groupBy : 'month';

    const where: Prisma.WorkOrderWhereInput = {
      status: WorkOrderStatus.BILLED,
      billedAt: { gte: from, lte: to },
    };
    if (filters.mechanicId) where.operatorId = filters.mechanicId === 'none' ? null : filters.mechanicId;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod as Prisma.EnumPaymentMethodNullableFilter['equals'];
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      const plate = q.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      where.OR = [
        { client: { name: { contains: q, mode: 'insensitive' } } },
        ...(plate ? [{ vehicle: { licensePlate: { contains: plate } } }] : []),
        ...(/^\d+$/.test(q) ? [{ code: Number(q) }] : []),
      ];
    }
    const orderFiltersApplied = !!(filters.mechanicId || filters.paymentMethod || filters.q?.trim());

    const [settings, orders, expenses] = await Promise.all([
      this.getSettings(),
      this.prisma.workOrder.findMany({
        where,
        orderBy: { billedAt: 'asc' },
        include: {
          client: { select: { id: true, name: true } },
          vehicle: { select: { licensePlate: true, brand: true, model: true, year: true } },
          operator: { select: { id: true, name: true } },
          items: {
            select: {
              itemType: true,
              quantity: true,
              unitCost: true,
              unitPrice: true,
              totalPrice: true,
              service: { select: { name: true } },
              product: { select: { name: true, sku: true } },
            },
          },
        },
      }),
      this.prisma.cashTransaction.findMany({
        where: { type: TransactionType.EXPENSE, status: { not: TransactionStatus.CANCELLED }, paidAt: { gte: from, lte: to } },
        include: { beneficiary: { select: { id: true, name: true } } },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    // ---------- OS ----------
    const summary = emptyTotals();
    const periods = new Map<string, { key: string; label: string; totals: Totals; expenses: Dec }>();
    const mechanics = new Map<
      string,
      { id: string | null; name: string; rates: Set<string>; totals: Totals; paid: Dec; orders: unknown[] }
    >();

    const rows = orders.map((o) => {
      const f = computeOrder({
        totalServices: o.totalServices,
        totalProducts: o.totalProducts,
        discount: o.discount,
        issRate: o.issRate,
        commissionRate: o.commissionRate,
        hasMechanic: !!o.operatorId,
        items: o.items,
      });
      addTo(summary, f);

      const billedAt = o.billedAt!;
      const p = periodOf(billedAt, groupBy);
      if (!periods.has(p.key)) periods.set(p.key, { ...p, totals: emptyTotals(), expenses: ZERO });
      addTo(periods.get(p.key)!.totals, f);

      const services = o.items.filter((i) => i.itemType === 'SERVICE').map((i) => i.service?.name).filter(Boolean).join(', ');
      const mKey = o.operator?.id ?? 'none';
      if (!mechanics.has(mKey)) {
        mechanics.set(mKey, { id: o.operator?.id ?? null, name: o.operator?.name ?? 'Sem mecânico', rates: new Set(), totals: emptyTotals(), paid: ZERO, orders: [] });
      }
      const m = mechanics.get(mKey)!;
      addTo(m.totals, f);
      m.rates.add(f.commissionRate.toFixed(2));
      m.orders.push({
        id: o.id,
        code: o.code,
        date: localDay(billedAt),
        vehicle: `${o.vehicle.model} ${o.vehicle.year} / ${o.vehicle.licensePlate}`,
        services,
        labor: money(f.labor),
        commissionRate: Number(f.commissionRate),
        commission: money(f.commission),
      });

      return {
        id: o.id,
        code: o.code,
        billedAt: billedAt.toISOString(),
        date: localDay(billedAt),
        client: o.client.name,
        vehicle: `${o.vehicle.brand} ${o.vehicle.model} ${o.vehicle.year}`,
        plate: o.vehicle.licensePlate,
        services,
        mechanic: o.operator?.name ?? 'Sem mecânico',
        mechanicId: o.operator?.id ?? null,
        paymentMethod: o.paymentMethod,
        payment: paymentLabel(o.paymentMethod, o.installments),
        partsCost: money(f.partsCost),
        partsSale: money(f.partsSale),
        partsProfit: money(f.partsProfit),
        labor: money(f.labor),
        discount: money(f.discount),
        totalBilled: money(f.totalBilled),
        grossProfit: money(f.grossProfit),
        issRate: Number(f.issRate),
        iss: money(f.iss),
        commissionRate: Number(f.commissionRate),
        commission: money(f.commission),
        netResult: money(f.netResult),
      };
    });

    // ---------- Despesas ----------
    let operationalExpenses = ZERO;
    let commissionPayments = ZERO;
    let paidByCash = ZERO;
    let paidByPartner = ZERO;
    const byCategory = new Map<string, Dec>();
    const expenseRows = expenses.map((e) => {
      const amount = D(e.amount);
      const isCommission = e.category === COMMISSION_PAYMENT;
      if (isCommission) commissionPayments = commissionPayments.add(amount);
      else operationalExpenses = operationalExpenses.add(amount);
      if (e.paidBy === 'SOCIO') paidByPartner = paidByPartner.add(amount);
      else paidByCash = paidByCash.add(amount);
      byCategory.set(e.category, (byCategory.get(e.category) ?? ZERO).add(amount));

      const mechanicMatches = !filters.mechanicId || filters.mechanicId === e.beneficiaryId;
      if (isCommission && e.beneficiaryId && mechanicMatches) {
        const key = e.beneficiaryId;
        if (!mechanics.has(key)) {
          mechanics.set(key, { id: key, name: e.beneficiary?.name ?? 'Mecânico', rates: new Set(), totals: emptyTotals(), paid: ZERO, orders: [] });
        }
        mechanics.get(key)!.paid = mechanics.get(key)!.paid.add(amount);
      }
      if (!isCommission && e.paidAt) {
        const p = periodOf(e.paidAt, groupBy);
        if (!periods.has(p.key)) periods.set(p.key, { ...p, totals: emptyTotals(), expenses: ZERO });
        periods.get(p.key)!.expenses = periods.get(p.key)!.expenses.add(amount);
      }

      return {
        id: e.id,
        date: e.paidAt ? localDay(e.paidAt) : null,
        paidAt: e.paidAt?.toISOString() ?? null,
        description: e.description ?? '',
        category: e.category,
        categoryLabel: EXPENSE_CATEGORIES[e.category] ?? e.category,
        amount: money(amount),
        paymentMethod: e.paymentMethod,
        payment: paymentLabel(e.paymentMethod, null),
        paidBy: e.paidBy ?? 'CAIXA',
        beneficiaryId: e.beneficiaryId,
        beneficiary: e.beneficiary?.name ?? null,
        notes: e.notes,
      };
    });

    // Despesas só entram no resultado quando o relatório não está filtrado por OS (mecânico, pagamento, busca)
    const includeExpenses = !orderFiltersApplied;
    const s = totalsOut(summary);
    const result = includeExpenses ? D(s.netResult).sub(operationalExpenses) : null;

    return {
      period: { from: from.toISOString(), to: to.toISOString(), groupBy },
      settings,
      filtersApplied: orderFiltersApplied,
      summary: {
        ...s,
        operationalExpenses: includeExpenses ? money(operationalExpenses) : null,
        result: result ? money(result) : null,
        // Indicadores
        grossMargin: s.totalBilled ? Number(((s.grossProfit / s.totalBilled) * 100).toFixed(2)) : 0,
        averageTicket: s.orders ? money(D(s.totalBilled).div(s.orders)) : 0,
      },
      orders: rows,
      periods: [...periods.values()]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((p) => {
          const t = totalsOut(p.totals);
          return {
            key: p.key,
            label: p.label,
            ...t,
            expenses: includeExpenses ? money(p.expenses) : null,
            result: includeExpenses ? money(D(t.netResult).sub(p.expenses)) : null,
          };
        }),
      mechanics: [...mechanics.values()]
        .map((m) => {
          const t = totalsOut(m.totals);
          return {
            id: m.id,
            name: m.name,
            commissionRates: [...m.rates].map(Number),
            orders: t.orders,
            labor: t.labor,
            commission: t.commission,
            paid: money(m.paid),
            balance: money(D(t.commission).sub(m.paid)),
            items: m.orders,
          };
        })
        .sort((a, b) => b.labor - a.labor),
      expenses: {
        rows: expenseRows,
        total: money(operationalExpenses.add(commissionPayments)),
        operational: money(operationalExpenses),
        commissionPayments: money(commissionPayments),
        paidByCash: money(paidByCash),
        paidByPartner: money(paidByPartner),
        byCategory: [...byCategory.entries()].map(([key, v]) => ({ key, label: EXPENSE_CATEGORIES[key] ?? key, amount: money(v) })),
      },
    };
  }

  // ==========================================
  // FECHAMENTO DE UMA OS (documento "Controle de Serviço")
  // ==========================================

  async orderClosing(id: string) {
    const o = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        client: { select: { name: true, phone: true, document: true } },
        vehicle: { select: { licensePlate: true, brand: true, model: true, year: true } },
        operator: { select: { name: true } },
        items: { include: { service: { select: { name: true } }, product: { select: { name: true, sku: true } } } },
      },
    });
    if (!o) throw new NotFoundException('Ordem de Serviço não encontrada.');

    const settings = await this.getSettings();
    // OS ainda não faturada: prévia com a alíquota atual de ISS e a comissão atual do mecânico
    let commissionRate = o.commissionRate;
    if (commissionRate === null && o.operatorId) {
      commissionRate = (await this.prisma.user.findUnique({ where: { id: o.operatorId }, select: { commissionRate: true } }))?.commissionRate ?? null;
    }
    const f = computeOrder({
      totalServices: o.totalServices,
      totalProducts: o.totalProducts,
      discount: o.discount,
      issRate: o.issRate ?? settings.issRate,
      commissionRate,
      hasMechanic: !!o.operatorId,
      items: o.items,
    });

    return {
      id: o.id,
      code: o.code,
      status: o.status,
      billed: o.status === WorkOrderStatus.BILLED,
      date: localDay(o.billedAt ?? o.finishedAt ?? o.createdAt),
      payment: paymentLabel(o.paymentMethod, o.installments),
      client: o.client.name,
      vehicle: `${o.vehicle.brand} ${o.vehicle.model} ${o.vehicle.year}`,
      plate: o.vehicle.licensePlate,
      mechanic: o.operator?.name ?? 'Sem mecânico',
      reportedIssue: o.reportedIssue,
      technicalNotes: o.technicalNotes,
      services: o.items
        .filter((i) => i.itemType === 'SERVICE')
        .map((i) => ({ description: i.service?.name ?? 'Serviço', quantity: i.quantity, total: money(D(i.totalPrice)) })),
      parts: o.items
        .filter((i) => i.itemType === 'PRODUCT')
        .map((i) => ({
          description: i.product?.name ?? 'Peça',
          sku: i.product?.sku ?? '',
          quantity: i.quantity,
          unitCost: money(D(i.unitCost)),
          cost: money(D(i.unitCost).mul(i.quantity)),
          sale: money(D(i.totalPrice)),
        })),
      totals: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, money(v as Dec)])),
      settings,
    };
  }

  // ==========================================
  // DESPESAS
  // ==========================================

  private async validateBeneficiary(category: string | undefined, beneficiaryId: string | null | undefined) {
    if (category === COMMISSION_PAYMENT && !beneficiaryId) {
      throw new BadRequestException('Informe o mecânico que recebeu o pagamento de comissão.');
    }
    if (beneficiaryId) {
      const u = await this.prisma.user.findUnique({ where: { id: beneficiaryId }, select: { role: true } });
      if (!u || u.role === UserRole.CLIENT) throw new BadRequestException('Mecânico não encontrado.');
    }
  }

  async createExpense(dto: CreateExpenseDto) {
    await this.validateBeneficiary(dto.category, dto.beneficiaryId);
    return this.prisma.cashTransaction.create({
      data: {
        type: TransactionType.EXPENSE,
        status: TransactionStatus.PAID,
        paidAt: new Date(dto.paidAt),
        description: dto.description.trim(),
        category: dto.category,
        amount: D(dto.amount),
        paymentMethod: dto.paymentMethod,
        paidBy: dto.paidBy,
        beneficiaryId: dto.category === COMMISSION_PAYMENT ? dto.beneficiaryId : (dto.beneficiaryId ?? null),
        notes: dto.notes || null,
      },
    });
  }

  async updateExpense(id: string, dto: UpdateExpenseDto) {
    const current = await this.prisma.cashTransaction.findUnique({ where: { id } });
    if (!current || current.type !== TransactionType.EXPENSE) throw new NotFoundException('Despesa não encontrada.');
    const category = dto.category ?? current.category;
    const beneficiaryId = dto.beneficiaryId !== undefined ? dto.beneficiaryId : current.beneficiaryId;
    await this.validateBeneficiary(category, beneficiaryId);

    return this.prisma.cashTransaction.update({
      where: { id },
      data: {
        ...(dto.paidAt ? { paidAt: new Date(dto.paidAt) } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.amount !== undefined ? { amount: D(dto.amount) } : {}),
        ...(dto.paymentMethod ? { paymentMethod: dto.paymentMethod } : {}),
        ...(dto.paidBy ? { paidBy: dto.paidBy } : {}),
        ...(dto.beneficiaryId !== undefined ? { beneficiaryId: dto.beneficiaryId || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
      },
    });
  }

  async removeExpense(id: string) {
    const current = await this.prisma.cashTransaction.findUnique({ where: { id } });
    if (!current || current.type !== TransactionType.EXPENSE) throw new NotFoundException('Despesa não encontrada.');
    await this.prisma.cashTransaction.delete({ where: { id } });
    return { deleted: true };
  }

  // ==========================================
  // APOIO
  // ==========================================

  /** Equipe ativa (para filtros, pagamento de comissão e mecânico responsável da OS). */
  listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: [UserRole.ADMIN, UserRole.OPERATOR] }, isActive: true },
      select: { id: true, name: true, profile: true, commissionRate: true },
      orderBy: { name: 'asc' },
    });
  }

  meta() {
    return {
      expenseCategories: Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => ({ key, label })),
      paymentMethods: Object.entries(PAYMENT_LABELS).map(([key, label]) => ({ key, label })),
      taxRegimes: Object.entries(TAX_REGIME_LABELS).map(([key, label]) => ({ key, label })),
    };
  }
}
