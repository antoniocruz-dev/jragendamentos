import type { Accent } from '@/components/ui/Card';

/** Status internos da OS (API) */
export type WorkOrderStatus =
  | 'DRAFT'
  | 'QUOTE'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'TESTING'
  | 'COMPLETED'
  | 'BILLED'
  | 'CANCELLED';

export type BudgetStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Vocabulário do SPEC (usado no portal do mecânico) */
export type MechanicStatus = 'AGUARDANDO_APROVACAO' | 'AGUARDANDO_INICIO' | 'EM_EXECUCAO' | 'AGUARDANDO_PECA' | 'EM_TESTE' | 'CONCLUIDA';

interface StatusInfo {
  label: string;
  /** Etapa da barra de progresso (0 a 5) */
  step: number;
  accent: Accent;
}

export const STATUS_INFO: Record<WorkOrderStatus, StatusInfo> = {
  DRAFT: { label: 'Rascunho', step: 0, accent: 'muted' },
  QUOTE: { label: 'Aguardando aprovação', step: 1, accent: 'neon' },
  APPROVED: { label: 'Aguardando início', step: 2, accent: 'brown' },
  IN_PROGRESS: { label: 'Em execução', step: 3, accent: 'brown' },
  WAITING_PARTS: { label: 'Aguardando peça', step: 3, accent: 'muted' },
  TESTING: { label: 'Em teste', step: 4, accent: 'brown' },
  COMPLETED: { label: 'Concluída', step: 5, accent: 'deep' },
  BILLED: { label: 'Concluída e paga', step: 5, accent: 'deep' },
  CANCELLED: { label: 'Cancelada', step: 0, accent: 'danger' },
};

export const PROGRESS_STEPS = ['Orçamento', 'Aprovada', 'Execução', 'Teste', 'Concluída'];

export const MECHANIC_LABEL: Record<MechanicStatus, string> = {
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  AGUARDANDO_INICIO: 'Aguardando início',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_PECA: 'Aguardando peça',
  EM_TESTE: 'Em teste',
  CONCLUIDA: 'Concluída',
};

/** Texto do botão que leva a OS para o próximo status (portal do mecânico). */
export const MECHANIC_ACTION: Partial<Record<MechanicStatus, string>> = {
  EM_EXECUCAO: 'Iniciar / retomar execução',
  AGUARDANDO_PECA: 'Aguardando peça',
  EM_TESTE: 'Enviar para teste',
  CONCLUIDA: 'Concluir O.S',
};

export const isPendingBudget = (o: { status: string; budgetStatus?: string }) => o.status === 'QUOTE' && (o.budgetStatus ?? 'PENDING') === 'PENDING';

export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const brDate = (v: string | null | undefined, withTime = false) =>
  v
    ? new Date(v).toLocaleString('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Belem' } : { dateStyle: 'short', timeZone: 'America/Belem' })
    : '—';
