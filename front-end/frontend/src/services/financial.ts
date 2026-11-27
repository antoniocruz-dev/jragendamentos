/** Tipos e utilitários do módulo Financeiro (espelho da API /financial). */

export type GroupBy = 'week' | 'month' | 'year';

export interface FinancialSettings {
  taxRegime: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL' | 'MEI';
  taxRegimeLabel: string;
  issRate: number;
  municipality: string;
  serviceCode: string;
  companyName: string;
  updatedAt: string;
}

export interface Totals {
  orders: number;
  partsSale: number;
  partsCost: number;
  partsProfit: number;
  labor: number;
  discount: number;
  totalBilled: number;
  grossProfit: number;
  iss: number;
  commission: number;
  netResult: number;
}

export interface OrderRow {
  id: string;
  code: number;
  billedAt: string;
  date: string;
  client: string;
  vehicle: string;
  plate: string;
  services: string;
  mechanic: string;
  mechanicId: string | null;
  paymentMethod: string | null;
  payment: string;
  partsCost: number;
  partsSale: number;
  partsProfit: number;
  labor: number;
  discount: number;
  totalBilled: number;
  grossProfit: number;
  issRate: number;
  iss: number;
  commissionRate: number;
  commission: number;
  netResult: number;
}

export interface PeriodRow extends Totals {
  key: string;
  label: string;
  expenses: number | null;
  result: number | null;
}

export interface MechanicRow {
  id: string | null;
  name: string;
  commissionRates: number[];
  orders: number;
  labor: number;
  commission: number;
  paid: number;
  balance: number;
  items: { id: string; code: number; date: string; vehicle: string; services: string; labor: number; commissionRate: number; commission: number }[];
}

export interface ExpenseRow {
  id: string;
  /** Contas a pagar: PENDING com vencimento (dueDate); despesas pagas: PAID */
  status?: 'PAID' | 'PENDING';
  dueDate?: string | null;
  date: string | null;
  paidAt: string | null;
  description: string;
  category: string;
  categoryLabel: string;
  amount: number;
  paymentMethod: string;
  payment: string;
  paidBy: 'CAIXA' | 'SOCIO';
  beneficiaryId: string | null;
  beneficiary: string | null;
  notes: string | null;
}

export interface FinancialReport {
  period: { from: string; to: string; groupBy: GroupBy };
  settings: FinancialSettings;
  filtersApplied: boolean;
  summary: Totals & {
    operationalExpenses: number | null;
    result: number | null;
    grossMargin: number;
    averageTicket: number;
  };
  orders: OrderRow[];
  periods: PeriodRow[];
  mechanics: MechanicRow[];
  expenses: {
    rows: ExpenseRow[];
    total: number;
    operational: number;
    commissionPayments: number;
    paidByCash: number;
    paidByPartner: number;
    byCategory: { key: string; label: string; amount: number }[];
  };
}

export interface FinancialMeta {
  expenseCategories: { key: string; label: string }[];
  paymentMethods: { key: string; label: string }[];
  taxRegimes: { key: string; label: string }[];
}

export interface StaffOption {
  id: string;
  name: string;
  profile: string | null;
  commissionRate?: string | number;
}

export interface OrderClosing {
  id: string;
  code: number;
  status: string;
  billed: boolean;
  date: string;
  payment: string;
  client: string;
  vehicle: string;
  plate: string;
  mechanic: string;
  reportedIssue: string | null;
  technicalNotes: string | null;
  services: { description: string; quantity: number; total: number }[];
  parts: { description: string; sku: string; quantity: number; unitCost: number; cost: number; sale: number }[];
  totals: Record<
    | 'grossServices' | 'grossProducts' | 'discount' | 'laborDiscount' | 'partsDiscount' | 'partsSale' | 'partsCost'
    | 'partsProfit' | 'labor' | 'totalBilled' | 'grossProfit' | 'issRate' | 'iss' | 'commissionRate' | 'commission' | 'netResult',
    number
  >;
  settings: FinancialSettings;
}

export const PAYMENT_OPTIONS = [
  { key: 'PIX', label: 'PIX' },
  { key: 'DEBIT_CARD', label: 'Cartão de débito' },
  { key: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { key: 'CASH', label: 'Dinheiro' },
  { key: 'BANK_TRANSFER', label: 'Transferência bancária' },
];

export const GROUP_LABELS: Record<GroupBy, string> = { week: 'Semana', month: 'Mês', year: 'Ano' };

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
// "|| 0" troca -0 por 0 (evita exibir "-R$ 0,00")
export const brl = (v: number) => brlFmt.format(v || 0);
export const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** AAAA-MM-DD → DD/MM/AAAA */
export const brDate = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Soma em centavos (evita erro de ponto flutuante ao totalizar no navegador). */
export const sumMoney = (values: number[]) => Math.round(values.reduce((a, v) => a + Math.round(v * 100), 0)) / 100;

/** Extrato do recibo de comissão (GET /financial/commission-statement). */
export interface CommissionStatement {
  mechanic: { id: string; name: string };
  period: { from: string; to: string } | null;
  companyName: string | null;
  orders: {
    id: string;
    code: number;
    billedAt: string | null;
    date: string | null;
    client: string;
    vehicle: string;
    labor: number;
    commissionRate: number;
    commission: number;
  }[];
  laborTotal: number;
  total: number;
  balance: { mechanicId: string; name: string; commission: number; paid: number; balance: number };
}

/** Item de conta a pagar (GET /financial/payables). */
export interface PayableExpense {
  id: string;
  description: string;
  category: string;
  categoryLabel: string;
  amount: number;
  dueDate: string | null;
  paymentMethod: string;
  paidBy: 'CAIXA' | 'SOCIO';
  beneficiaryId: string | null;
  beneficiary: string | null;
  notes: string | null;
}

export interface Payables {
  /** Hoje na oficina (AAAA-MM-DD, America/Belem) */
  today: string;
  expenses: PayableExpense[];
  commissions: { mechanicId: string; name: string; commission: number; paid: number; balance: number }[];
}

/** Converte a conta a pagar no formato de linha usado pelo modal de despesa. */
export const payableToRow = (p: PayableExpense): ExpenseRow => ({
  ...p,
  status: 'PENDING',
  date: null,
  paidAt: null,
  payment: '',
});
