import { Prisma } from '@prisma/client';

/**
 * Regras de cálculo do módulo financeiro (fonte única de verdade).
 *
 * Por OS faturada (status BILLED), com valores congelados no faturamento:
 * - Desconto: só nas peças (regra da oficina). Nunca reduz mão de obra, base do ISS ou comissão.
 *   A OS não aceita desconto maior que o total de peças; se uma OS antiga tiver, o excedente sai
 *   da mão de obra só para o total faturado continuar igual ao valor recebido no caixa.
 * - Venda de peças (líquida)  = total de peças − desconto
 * - Custo das peças           = Σ (custo unitário de saída × quantidade)
 * - Lucro das peças           = venda de peças − custo das peças
 * - Mão de obra              = total de serviços
 * - Total faturado            = venda de peças + mão de obra  (= valor final da OS)
 * - Lucro bruto da oficina    = lucro das peças + mão de obra (= total faturado − custo das peças)
 * - ISS                       = mão de obra × alíquota de ISS da OS (peças: ICMS, fora da base do ISS)
 * - Comissão do mecânico      = 50% do valor de cada serviço, para o mecânico daquele serviço
 *                               (serviço sem mecânico próprio: responsável da OS). COMMISSION_RATE.
 * - Resultado da OS           = lucro bruto − ISS − comissão
 *
 * Todos os valores são arredondados a centavos (meio para cima) por OS e só depois somados,
 * como acontece em cada nota de serviço.
 */

export type Dec = Prisma.Decimal;
export const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);
export const ZERO = D(0);
export const round2 = (v: Dec) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const pct = (base: Dec, rate: Dec) => round2(base.mul(rate).div(100));
export const money = (v: Dec) => Number(round2(v).toFixed(2));

/** Comissão do mecânico responsável: 50% da mão de obra, fixa (regra da oficina). */
export const COMMISSION_RATE = new Prisma.Decimal(50);

export interface OrderInput {
  totalServices: Prisma.Decimal.Value;
  totalProducts: Prisma.Decimal.Value;
  discount: Prisma.Decimal.Value;
  issRate: Prisma.Decimal.Value | null;
  /** Mecânico responsável da OS: recebe a comissão dos serviços sem mecânico próprio. */
  operatorId: string | null;
  items: {
    itemType: string;
    quantity: number;
    unitCost: Prisma.Decimal.Value;
    totalPrice?: Prisma.Decimal.Value;
    mechanicId?: string | null;
  }[];
}

/** Parte de um mecânico na OS: mão de obra dos serviços dele e a comissão (50% dela). */
export interface MechanicShare {
  mechanicId: string;
  labor: Dec;
  commission: Dec;
}

/**
 * Mão de obra por mecânico: cada serviço vai para o seu mecânico (ou para o responsável da OS).
 * Serviço sem mecânico e OS sem responsável: fica sem comissão. No caso legado de desconto maior
 * que as peças, o excedente (laborDiscount) reduz a parte de cada mecânico na proporção dos seus
 * serviços; o resto do arredondamento fica com a maior parte, para a soma fechar com a mão de obra.
 */
function laborByMechanic(o: OrderInput, grossServices: Dec, labor: Dec): Map<string, Dec> {
  const gross = new Map<string, Dec>();
  const services = o.items.filter((i) => i.itemType === 'SERVICE');
  const hasItemPrices = services.length > 0 && services.every((i) => i.totalPrice !== undefined);
  if (!hasItemPrices) {
    // Sem os valores por item: a OS inteira é do responsável (comportamento de antes)
    if (o.operatorId && grossServices.gt(0)) gross.set(o.operatorId, grossServices);
  } else {
    for (const i of services) {
      const who = i.mechanicId || o.operatorId;
      if (!who) continue;
      gross.set(who, (gross.get(who) ?? ZERO).add(D(i.totalPrice)));
    }
  }
  if (labor.eq(grossServices) || grossServices.isZero()) return gross;

  const result = new Map<string, Dec>();
  let assigned = ZERO;
  let target = ZERO;
  let biggest: string | null = null;
  for (const [id, g] of gross) {
    const share = round2(g.mul(labor).div(grossServices));
    result.set(id, share);
    assigned = assigned.add(share);
    target = target.add(g);
    if (!biggest || g.gt(gross.get(biggest)!)) biggest = id;
  }
  const expected = round2(target.mul(labor).div(grossServices));
  if (biggest && !assigned.eq(expected)) result.set(biggest, result.get(biggest)!.add(expected.sub(assigned)));
  return result;
}

export interface OrderFinancials {
  grossServices: Dec;
  grossProducts: Dec;
  discount: Dec;
  laborDiscount: Dec;
  partsDiscount: Dec;
  partsSale: Dec;
  partsCost: Dec;
  partsProfit: Dec;
  labor: Dec;
  totalBilled: Dec;
  grossProfit: Dec;
  issRate: Dec;
  iss: Dec;
  commissionRate: Dec;
  commission: Dec;
  netResult: Dec;
  /** Mão de obra e comissão de cada mecânico da OS (a soma é a comissão da OS). */
  byMechanic: MechanicShare[];
}

export function computeOrder(o: OrderInput): OrderFinancials {
  const grossServices = round2(D(o.totalServices));
  const grossProducts = round2(D(o.totalProducts));
  const discount = round2(D(o.discount));

  // Desconto só em peças; excedente (apenas em OS antigas) sai da mão de obra para fechar com o caixa
  const partsDiscount = Prisma.Decimal.min(discount, grossProducts);
  const laborDiscount = Prisma.Decimal.min(discount.sub(partsDiscount), grossServices);

  const partsSale = grossProducts.sub(partsDiscount);
  const partsCost = round2(
    o.items
      .filter((i) => i.itemType === 'PRODUCT')
      .reduce((acc, i) => acc.add(D(i.unitCost).mul(i.quantity)), ZERO),
  );
  const partsProfit = partsSale.sub(partsCost);
  const labor = grossServices.sub(laborDiscount);
  const totalBilled = partsSale.add(labor);
  const grossProfit = partsProfit.add(labor);

  const issRate = D(o.issRate);
  const iss = pct(labor, issRate);
  // Comissão: 50% do valor de cada serviço para o mecânico daquele serviço (arredondada por mecânico)
  const byMechanic: MechanicShare[] = [...laborByMechanic(o, grossServices, labor)].map(([mechanicId, l]) => ({
    mechanicId,
    labor: l,
    commission: pct(l, COMMISSION_RATE),
  }));
  const commissionRate = byMechanic.length ? COMMISSION_RATE : ZERO;
  const commission = byMechanic.reduce((acc, m) => acc.add(m.commission), ZERO);
  const netResult = grossProfit.sub(iss).sub(commission);

  return {
    grossServices,
    grossProducts,
    discount,
    laborDiscount,
    partsDiscount,
    partsSale,
    partsCost,
    partsProfit,
    labor,
    totalBilled,
    grossProfit,
    issRate,
    iss,
    commissionRate,
    commission,
    netResult,
    byMechanic,
  };
}

// ==========================================
// Despesas
// ==========================================

/** Pagamento ao mecânico: quita a comissão já apurada (não entra de novo como despesa no resultado). */
export const COMMISSION_PAYMENT = 'COMISSAO_MECANICO';

export const EXPENSE_CATEGORIES: Record<string, string> = {
  COMISSAO_MECANICO: 'Pagamento de comissão (mecânico)',
  FUNCIONARIOS: 'Pagamento de funcionários / ajudantes',
  INSUMOS: 'Insumos da oficina',
  ALUGUEL_CONTAS: 'Aluguel / contas (água, luz, internet, contador)',
  FERRAMENTAL: 'Ferramental / equipamentos',
  IMPOSTOS_TAXAS: 'Impostos e taxas',
  MANUTENCAO: 'Manutenção da oficina',
  MARKETING: 'Marketing / divulgação',
  OUTROS: 'Outras despesas',
};

// ==========================================
// Períodos (fuso da oficina: Parauapebas/PA, sem horário de verão)
// ==========================================

export const SHOP_TIMEZONE = 'America/Belem';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Data local da oficina no formato AAAA-MM-DD. */
export function localDay(date: Date) {
  return dayFmt.format(date);
}

export type GroupBy = 'week' | 'month' | 'year';

/** Chave e rótulo do período (semana de segunda a domingo, mês ou ano) de uma data. */
export function periodOf(date: Date, groupBy: GroupBy): { key: string; label: string } {
  const [y, m, d] = localDay(date).split('-').map(Number);
  if (groupBy === 'year') return { key: String(y), label: String(y) };
  if (groupBy === 'month') return { key: `${y}-${String(m).padStart(2, '0')}`, label: `${String(m).padStart(2, '0')}/${y}` };

  // Semana: segunda-feira como início (cálculo em UTC puro sobre a data local)
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = (utc.getUTCDay() + 6) % 7; // 0 = segunda
  const start = new Date(utc.getTime() - dow * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const f = (x: Date) => `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
  return { key: start.toISOString().slice(0, 10), label: `${f(start)} a ${f(end)}/${end.getUTCFullYear()}` };
}
