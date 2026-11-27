import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RefundStatus, TransactionType, TransactionStatus, UserRole, WorkOrderStatus } from '@prisma/client';
import { returnWorkOrderStock } from '../common/stock.js';
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
import { CreateExpenseDto, PayExpenseDto, ResolveRefundDto, UpdateExpenseDto, UpdateSettingsDto } from './dto/financial.dto.js';

/**
 * OS que contam como receita: faturadas, e as faturadas que foram canceladas enquanto o estorno
 * não foi feito (o dinheiro ainda está no caixa) ou quando a oficina decidiu não devolver.
 */
export const REVENUE_ORDERS: Prisma.WorkOrderWhereInput = {
  OR: [
    { status: WorkOrderStatus.BILLED },
    { status: WorkOrderStatus.CANCELLED, billedAt: { not: null }, refundStatus: { in: [RefundStatus.PENDING, RefundStatus.WAIVED] } },
  ],
};

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

/** OS em que o mecânico participa: responsável da OS ou mecânico de algum serviço. */
export function involvesMechanic(mechanicId: string): Prisma.WorkOrderWhereInput {
  return { OR: [{ operatorId: mechanicId }, { items: { some: { mechanicId } } }] };
}

/** Campos dos itens que o cálculo da OS (computeOrder) precisa, incluindo o mecânico de cada serviço. */
const CALC_ITEM_SELECT = { itemType: true, quantity: true, unitCost: true, totalPrice: true, mechanicId: true } as const;

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
      AND: [REVENUE_ORDERS],
      billedAt: { gte: from, lte: to },
    };
    // Mecânico: OS em que ele é o responsável ou executa algum serviço
    if (filters.mechanicId === 'none') {
      where.operatorId = null;
      where.items = { none: { mechanicId: { not: null } } };
    } else if (filters.mechanicId) {
      (where.AND as Prisma.WorkOrderWhereInput[]).push(involvesMechanic(filters.mechanicId));
    }
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
              ...CALC_ITEM_SELECT,
              unitPrice: true,
              mechanic: { select: { id: true, name: true } },
              service: { select: { name: true } },
              product: { select: { name: true, sku: true } },
            },
          },
        },
      }),
      this.prisma.cashTransaction.findMany({
        // Só despesas pagas: conta a pagar (PENDING) entra no resultado na data da baixa
        where: { type: TransactionType.EXPENSE, status: TransactionStatus.PAID, paidAt: { gte: from, lte: to } },
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
        operatorId: o.operatorId,
        items: o.items,
      });
      addTo(summary, f);

      const billedAt = o.billedAt!;
      const p = periodOf(billedAt, groupBy);
      if (!periods.has(p.key)) periods.set(p.key, { ...p, totals: emptyTotals(), expenses: ZERO });
      addTo(periods.get(p.key)!.totals, f);

      const serviceItems = o.items.filter((i) => i.itemType === 'SERVICE');
      const services = serviceItems.map((i) => i.service?.name).filter(Boolean).join(', ');
      const names = new Map<string, string>();
      if (o.operator) names.set(o.operator.id, o.operator.name);
      for (const i of serviceItems) if (i.mechanic) names.set(i.mechanic.id, i.mechanic.name);

      // Produção por mecânico: cada um com a mão de obra e a comissão dos serviços dele
      const shares: { id: string | null; labor: Dec; commission: Dec }[] = f.byMechanic.map((s) => ({
        id: s.mechanicId,
        labor: s.labor,
        commission: s.commission,
      }));
      const unassigned = f.labor.sub(shares.reduce((acc, s) => acc.add(s.labor), ZERO));
      if (unassigned.gt(0)) shares.push({ id: null, labor: unassigned, commission: ZERO });
      for (const s of shares) {
        if (filters.mechanicId && filters.mechanicId !== (s.id ?? 'none')) continue;
        const mKey = s.id ?? 'none';
        if (!mechanics.has(mKey)) {
          mechanics.set(mKey, { id: s.id, name: s.id ? (names.get(s.id) ?? 'Mecânico') : 'Sem mecânico', rates: new Set(), totals: emptyTotals(), paid: ZERO, orders: [] });
        }
        const m = mechanics.get(mKey)!;
        m.totals.orders += 1;
        m.totals.labor = m.totals.labor.add(s.labor);
        m.totals.commission = m.totals.commission.add(s.commission);
        const rate = s.id ? f.commissionRate : ZERO;
        m.rates.add(rate.toFixed(2));
        m.orders.push({
          id: o.id,
          code: o.code,
          date: localDay(billedAt),
          vehicle: `${o.vehicle.model} ${o.vehicle.year} / ${o.vehicle.licensePlate}`,
          services: serviceItems
            .filter((i) => (i.mechanicId || o.operatorId || null) === s.id)
            .map((i) => i.service?.name)
            .filter(Boolean)
            .join(', '),
          labor: money(s.labor),
          commissionRate: Number(rate),
          commission: money(s.commission),
        });
      }
      const mechanicNames = [...new Set(f.byMechanic.map((s) => names.get(s.mechanicId) ?? 'Mecânico'))];

      return {
        id: o.id,
        code: o.code,
        billedAt: billedAt.toISOString(),
        date: localDay(billedAt),
        client: o.client.name,
        vehicle: `${o.vehicle.brand} ${o.vehicle.model} ${o.vehicle.year}`,
        plate: o.vehicle.licensePlate,
        services,
        mechanic: mechanicNames.length ? mechanicNames.join(', ') : 'Sem mecânico',
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
  // COMISSÕES: saldo por mecânico e recibo
  // ==========================================

  /**
   * Saldo de comissão de todo o histórico, por mecânico: comissão apurada nas OS que contam como
   * receita (computeOrder, arredondada por OS) − pagamentos de comissão já feitos (despesas pagas).
   */
  async mechanicBalances(mechanicId?: string) {
    const [orders, payments] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: {
          AND: [
            REVENUE_ORDERS,
            mechanicId
              ? involvesMechanic(mechanicId)
              : { OR: [{ operatorId: { not: null } }, { items: { some: { mechanicId: { not: null } } } }] },
          ],
        },
        select: {
          operatorId: true,
          totalServices: true,
          totalProducts: true,
          discount: true,
          issRate: true,
          items: { select: CALC_ITEM_SELECT },
        },
      }),
      this.prisma.cashTransaction.groupBy({
        by: ['beneficiaryId'],
        where: {
          type: TransactionType.EXPENSE,
          status: TransactionStatus.PAID,
          category: COMMISSION_PAYMENT,
          beneficiaryId: mechanicId ?? { not: null },
        },
        _sum: { amount: true },
      }),
    ]);

    const map = new Map<string, { commission: Dec; paid: Dec }>();
    const entry = (id: string) => {
      if (!map.has(id)) map.set(id, { commission: ZERO, paid: ZERO });
      return map.get(id)!;
    };
    for (const o of orders) {
      // Cada mecânico soma a comissão dos serviços dele (50% de cada serviço)
      for (const s of computeOrder(o).byMechanic) {
        if (mechanicId && s.mechanicId !== mechanicId) continue;
        entry(s.mechanicId).commission = entry(s.mechanicId).commission.add(s.commission);
      }
    }
    for (const p of payments) {
      if (p.beneficiaryId) entry(p.beneficiaryId).paid = entry(p.beneficiaryId).paid.add(D(p._sum.amount));
    }
    const ids = [...map.keys()];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    return ids.map((id) => {
      const m = map.get(id)!;
      return {
        mechanicId: id,
        name: names.get(id) ?? 'Mecânico',
        commission: money(m.commission),
        paid: money(m.paid),
        balance: money(m.commission.sub(m.paid)),
      };
    });
  }

  /**
   * Extrato para o recibo de comissão: OS do mecânico faturadas no período (ou só as escolhidas),
   * com a comissão de cada uma calculada por computeOrder e o total somado em Decimal.
   */
  async commissionStatement(filters: { mechanicId?: string; from?: string; to?: string; orderIds?: string }) {
    if (!filters.mechanicId) throw new BadRequestException('Informe o mecânico.');
    const mechanic = await this.prisma.user.findUnique({
      where: { id: filters.mechanicId },
      select: { id: true, name: true, role: true },
    });
    if (!mechanic || mechanic.role === UserRole.CLIENT) throw new NotFoundException('Mecânico não encontrado.');

    const ids = (filters.orderIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const from = parseDate(filters.from, 'from');
    const to = parseDate(filters.to, 'to');
    if (!ids.length && (!from || !to)) throw new BadRequestException('Informe o período ou as OS do recibo.');
    if (from && to && from > to) throw new BadRequestException('A data inicial deve ser anterior à final.');

    const orders = await this.prisma.workOrder.findMany({
      where: {
        AND: [REVENUE_ORDERS, involvesMechanic(mechanic.id)],
        ...(ids.length ? { id: { in: ids } } : { billedAt: { gte: from, lte: to } }),
      },
      orderBy: { billedAt: 'asc' },
      select: {
        id: true,
        code: true,
        billedAt: true,
        operatorId: true,
        totalServices: true,
        totalProducts: true,
        discount: true,
        issRate: true,
        client: { select: { name: true } },
        vehicle: { select: { licensePlate: true, brand: true, model: true } },
        items: { select: CALC_ITEM_SELECT },
      },
    });

    let total = ZERO;
    let laborTotal = ZERO;
    // Só a parte do mecânico em cada OS (os serviços dele); OS sem serviço dele fica de fora
    const rows = orders.flatMap((o) => {
      const f = computeOrder(o);
      const share = f.byMechanic.find((s) => s.mechanicId === mechanic.id);
      if (!share) return [];
      total = total.add(share.commission);
      laborTotal = laborTotal.add(share.labor);
      return [
        {
          id: o.id,
          code: o.code,
          billedAt: o.billedAt?.toISOString() ?? null,
          date: o.billedAt ? localDay(o.billedAt) : null,
          client: o.client.name,
          vehicle: `${o.vehicle.brand} ${o.vehicle.model} · ${o.vehicle.licensePlate}`,
          labor: money(share.labor),
          commissionRate: Number(f.commissionRate),
          commission: money(share.commission),
        },
      ];
    });
    const [balance] = await this.mechanicBalances(mechanic.id);
    const settings = await this.getSettings();

    return {
      mechanic: { id: mechanic.id, name: mechanic.name },
      period: from && to && !ids.length ? { from: from.toISOString(), to: to.toISOString() } : null,
      companyName: settings.companyName,
      orders: rows,
      laborTotal: money(laborTotal),
      total: money(total),
      balance: balance ?? { mechanicId: mechanic.id, name: mechanic.name, commission: 0, paid: 0, balance: 0 },
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
        items: {
          include: {
            service: { select: { name: true } },
            product: { select: { name: true, sku: true } },
            mechanic: { select: { name: true } },
          },
        },
      },
    });
    if (!o) throw new NotFoundException('Ordem de Serviço não encontrada.');

    const settings = await this.getSettings();
    // OS ainda não faturada: prévia com a alíquota atual de ISS (a comissão é fixa em 50%)
    const f = computeOrder({
      totalServices: o.totalServices,
      totalProducts: o.totalProducts,
      discount: o.discount,
      issRate: o.issRate ?? settings.issRate,
      operatorId: o.operatorId,
      items: o.items,
    });
    const { byMechanic: _byMechanic, ...totals } = f;

    return {
      id: o.id,
      code: o.code,
      status: o.status,
      billed: o.status === WorkOrderStatus.BILLED || (!!o.billedAt && o.refundStatus !== RefundStatus.REFUNDED && o.refundStatus !== null),
      date: localDay(o.billedAt ?? o.finishedAt ?? o.createdAt),
      payment: paymentLabel(o.paymentMethod, o.installments),
      client: o.client.name,
      vehicle: `${o.vehicle.brand} ${o.vehicle.model} ${o.vehicle.year}`,
      plate: o.vehicle.licensePlate,
      mechanic:
        [...new Set(f.byMechanic.map((s) => o.items.find((i) => i.mechanicId === s.mechanicId)?.mechanic?.name ?? o.operator?.name))]
          .filter(Boolean)
          .join(', ') || 'Sem mecânico',
      reportedIssue: o.reportedIssue,
      technicalNotes: o.technicalNotes,
      services: o.items
        .filter((i) => i.itemType === 'SERVICE')
        .map((i) => ({
          description: i.service?.name ?? 'Serviço',
          mechanic: i.mechanic?.name ?? o.operator?.name ?? null,
          quantity: i.quantity,
          total: money(D(i.totalPrice)),
        })),
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
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, money(v)])),
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
    const pending = dto.status === 'PENDING';
    if (pending && !dto.dueDate) throw new BadRequestException('Informe o vencimento da conta a pagar.');
    if (!pending && !dto.paidAt) throw new BadRequestException('Informe a data da despesa.');
    return this.prisma.cashTransaction.create({
      data: {
        type: TransactionType.EXPENSE,
        // Conta a pagar fica PENDING e sem paidAt: só entra no relatório depois da baixa
        status: pending ? TransactionStatus.PENDING : TransactionStatus.PAID,
        paidAt: pending ? null : new Date(dto.paidAt!),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
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
    // A situação (paga / a pagar) só muda pela baixa (PATCH /expenses/:id/pay)
    const isPending = current.status === TransactionStatus.PENDING;
    if (isPending && dto.dueDate === null) throw new BadRequestException('A conta a pagar precisa de vencimento.');

    return this.prisma.cashTransaction.update({
      where: { id },
      data: {
        ...(dto.paidAt && !isPending ? { paidAt: new Date(dto.paidAt) } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
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

  /**
   * Baixa de uma conta a pagar. O updateMany condicionado ao status PENDING é atômico:
   * duas baixas simultâneas da mesma conta não pagam duas vezes (a segunda recebe 409).
   */
  async payExpense(id: string, dto: PayExpenseDto) {
    const current = await this.prisma.cashTransaction.findUnique({ where: { id }, select: { type: true, status: true } });
    if (!current || current.type !== TransactionType.EXPENSE) throw new NotFoundException('Despesa não encontrada.');
    const { count } = await this.prisma.cashTransaction.updateMany({
      where: { id, status: TransactionStatus.PENDING },
      data: {
        status: TransactionStatus.PAID,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        ...(dto.paymentMethod ? { paymentMethod: dto.paymentMethod } : {}),
        ...(dto.paidBy ? { paidBy: dto.paidBy } : {}),
      },
    });
    if (count === 0) throw new ConflictException('Esta conta já foi paga.');
    return this.prisma.cashTransaction.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Contas a pagar para o alerta do Dashboard: despesas PENDING que vencem até o fim do mês
   * corrente (inclui as vencidas) e mecânicos com saldo de comissão em aberto.
   */
  async payables() {
    const [y, m] = localDay(new Date()).split('-').map(Number);
    // 1º dia do mês seguinte, 00:00 em Parauapebas (UTC−3, sem horário de verão)
    const nextMonth = new Date(Date.UTC(y, m, 1, 3));
    const [rows, balances] = await Promise.all([
      this.prisma.cashTransaction.findMany({
        where: { type: TransactionType.EXPENSE, status: TransactionStatus.PENDING, dueDate: { lt: nextMonth } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        include: { beneficiary: { select: { id: true, name: true } } },
      }),
      this.mechanicBalances(),
    ]);
    return {
      today: localDay(new Date()),
      expenses: rows.map((e) => ({
        id: e.id,
        description: e.description ?? '',
        category: e.category,
        categoryLabel: EXPENSE_CATEGORIES[e.category] ?? e.category,
        amount: money(D(e.amount)),
        dueDate: e.dueDate ? localDay(e.dueDate) : null,
        paymentMethod: e.paymentMethod,
        paidBy: e.paidBy ?? 'CAIXA',
        beneficiaryId: e.beneficiaryId,
        beneficiary: e.beneficiary?.name ?? null,
        notes: e.notes,
      })),
      commissions: balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance),
    };
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

  // ==========================================
  // PENDÊNCIAS DE ESTORNO (OS faturada cancelada)
  // ==========================================

  /** OS faturadas que foram canceladas. Padrão: só as pendentes. */
  async listRefunds(status?: string) {
    const refundStatus = status && status in RefundStatus ? (status as RefundStatus) : undefined;
    const rows = await this.prisma.workOrder.findMany({
      where: { refundStatus: refundStatus ?? (status === 'ALL' ? { not: null } : RefundStatus.PENDING) },
      orderBy: { cancelledAt: 'desc' },
      take: 200,
      select: {
        id: true,
        code: true,
        finalAmount: true,
        billedAt: true,
        paymentMethod: true,
        cancelledAt: true,
        cancelReason: true,
        refundStatus: true,
        refundResolvedAt: true,
        refundResolvedBy: true,
        refundNotes: true,
        stockReserved: true,
        client: { select: { name: true, phone: true } },
        vehicle: { select: { licensePlate: true, model: true } },
        items: { where: { itemType: 'PRODUCT' }, select: { quantity: true, product: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      ...r,
      finalAmount: Number(r.finalAmount),
      payment: r.paymentMethod ? (PAYMENT_LABELS[r.paymentMethod] ?? r.paymentMethod) : '',
      parts: r.items.map((i) => `${i.quantity}x ${i.product?.name ?? 'peça'}`),
      items: undefined,
    }));
  }

  /**
   * Resolve a pendência (Administrador). Estorno feito: cancela a entrada do caixa e, se marcado,
   * devolve as peças ao estoque. Sem estorno: a receita permanece. Tudo em uma transação.
   */
  async resolveRefund(id: string, dto: ResolveRefundDto, userName: string) {
    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({ where: { id }, include: { items: true } });
      if (!wo) throw new NotFoundException('Ordem de Serviço não encontrada.');
      if (wo.refundStatus !== RefundStatus.PENDING) throw new ConflictException('Esta pendência já foi resolvida.');

      const res = await tx.workOrder.updateMany({
        where: { id, refundStatus: RefundStatus.PENDING },
        data: {
          refundStatus: dto.resolution,
          refundResolvedAt: new Date(),
          refundResolvedBy: userName,
          refundNotes: dto.notes.trim(),
          ...(dto.resolution === 'REFUNDED' && dto.returnStock && wo.stockReserved ? { stockReserved: false } : {}),
        },
      });
      if (res.count !== 1) throw new ConflictException('Esta pendência já foi resolvida por outra pessoa.');

      if (dto.resolution === 'REFUNDED') {
        await tx.cashTransaction.updateMany({
          where: { workOrderId: id, type: TransactionType.INCOME, status: { not: TransactionStatus.CANCELLED } },
          data: { status: TransactionStatus.CANCELLED, notes: `Estorno manual (OS #${wo.code} cancelada): ${dto.notes.trim()}` },
        });
        if (dto.returnStock && wo.stockReserved) {
          await returnWorkOrderStock(tx, wo, `Devolução pelo estorno da OS #${wo.code}`, userName);
        }
      }
      return { id, code: wo.code, refundStatus: dto.resolution };
    });
  }
}
