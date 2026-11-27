'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ExternalLink, Loader2, LogOut, Wallet } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { Modal } from '@/components/crud';
import { toast } from '@/components/feedback';
import { Fireworks } from '@/components/ui';
import { clearPayablesAlert, hasPayablesAlert } from '@/lib/payables-alert';
import { brDate, brl, sumMoney, type PayableExpense, type Payables } from '@/services/financial';

type View = 'day' | 'week' | 'month';
const VIEWS: { key: View; label: string }[] = [
  { key: 'day', label: 'Hoje' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
];

/** Domingo da semana (segunda a domingo) de uma data AAAA-MM-DD, no mesmo formato. */
function weekEnd(today: string) {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7; // 0 = segunda
  date.setUTCDate(date.getUTCDate() + (6 - dow));
  return date.toISOString().slice(0, 10);
}

function inView(view: View, item: PayableExpense, today: string) {
  if (!item.dueDate) return view === 'month';
  if (view === 'day') return item.dueDate <= today; // vencidas + hoje
  if (view === 'week') return item.dueDate <= weekEnd(today);
  return true; // o backend já limita ao fim do mês
}

/**
 * Alerta informativo de contas a pagar, mostrado no Dashboard a cada login (quem tem o módulo
 * Financeiro). Visões Hoje / Semana / Mês, comissões em aberto, "Abrir" e "Dar baixa" em cada item.
 */
export function PayablesAlertModal({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Payables | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('day');
  const [paying, setPaying] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (!enabled || !hasPayablesAlert()) return;
    let alive = true;
    fetchApi<Payables>('/financial/payables')
      .then((p) => {
        if (!alive) return;
        clearPayablesAlert();
        if (p.expenses.length === 0 && p.commissions.length === 0) return; // nada pendente: não incomoda
        setData(p);
        // Abre na visão mais curta que tenha contas
        const first = (['day', 'week', 'month'] as View[]).find((v) => p.expenses.some((e) => inView(v, e, p.today)));
        setView(first ?? 'month');
        setOpen(true);
      })
      .catch(() => undefined); // o alerta é opcional: sem rede, o Dashboard segue normal
    return () => {
      alive = false;
    };
  }, [enabled]);

  async function pay(item: PayableExpense) {
    try {
      setPaying(item.id);
      await fetchApi(`/financial/expenses/${item.id}/pay`, { method: 'PATCH', body: JSON.stringify({}), successToast: false });
      toast.success(`"${item.description}" paga!`);
      setBurst((b) => b + 1);
      setData((d) => (d ? { ...d, expenses: d.expenses.filter((e) => e.id !== item.id) } : d));
    } catch {
      /* o fetchApi já mostra o erro */
    } finally {
      setPaying(null);
    }
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const items = data ? data.expenses.filter((e) => inView(view, e, data.today)) : [];
  const total = sumMoney(items.map((e) => e.amount));
  const commissionsTotal = data ? sumMoney(data.commissions.map((c) => c.balance)) : 0;

  return (
    <>
      <Fireworks burstKey={burst} />
      {open && data && (
        <Modal title="Contas a pagar" onClose={() => setOpen(false)} wide>
          <div className="space-y-4">
            <div role="tablist" aria-label="Período" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-muted">
              {VIEWS.map((v) => {
                const count = data.expenses.filter((e) => inView(v.key, e, data.today)).length;
                return (
                  <button
                    key={v.key}
                    type="button"
                    role="tab"
                    aria-selected={view === v.key}
                    onClick={() => setView(v.key)}
                    className={`min-h-10 rounded-lg text-sm font-semibold transition-colors ${
                      view === v.key ? 'bg-surface-white text-brand-ink shadow-sm' : 'text-brand-steel hover:text-brand-ink'
                    }`}
                  >
                    {v.label} <span className="tabular-nums">({count})</span>
                  </button>
                );
              })}
            </div>

            <section role="tabpanel" aria-label={VIEWS.find((v) => v.key === view)?.label}>
              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-brand-steel">
                  Nenhuma conta {view === 'day' ? 'vencida ou vencendo hoje' : view === 'week' ? 'para esta semana' : 'para este mês'}.
                </p>
              ) : (
                <ul className="divide-y divide-line-soft border border-line-soft rounded-xl">
                  {items.map((e) => {
                    const overdue = !!e.dueDate && e.dueDate < data.today;
                    const today = e.dueDate === data.today;
                    return (
                      <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <CalendarClock className={`w-5 h-5 shrink-0 ${overdue ? 'text-red-700' : 'text-gold-deep'}`} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-brand-ink truncate">{e.description}</p>
                          <p className={`text-xs ${overdue ? 'text-red-700 font-semibold' : 'text-brand-steel'}`}>
                            {overdue ? `Vencida em ${brDate(e.dueDate)}` : today ? 'Vence hoje' : `Vence em ${brDate(e.dueDate)}`} ·{' '}
                            {e.categoryLabel}
                          </p>
                        </div>
                        <b className="tabular-nums text-brand-ink">{brl(e.amount)}</b>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => go(`/financial?tab=expenses&expense=${e.id}`)}
                            className="min-h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border border-line text-brand-graphite hover:bg-surface-muted"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                            Abrir
                          </button>
                          <button
                            type="button"
                            disabled={paying === e.id}
                            onClick={() => pay(e)}
                            className="min-h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-bold bg-neon-primary text-brand-ink hover:bg-neon-soft disabled:opacity-60"
                          >
                            {paying === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Wallet className="w-3.5 h-3.5" aria-hidden />}
                            Dar baixa
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {items.length > 0 && (
                <p className="mt-2 text-right text-sm">
                  Total: <b className="tabular-nums">{brl(total)}</b>
                </p>
              )}
            </section>

            {data.commissions.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-brand-ink mb-1.5">
                  Comissões pendentes <span className="font-normal text-brand-steel">({brl(commissionsTotal)})</span>
                </h3>
                <ul className="divide-y divide-line-soft border border-line-soft rounded-xl">
                  {data.commissions.map((c) => (
                    <li key={c.mechanicId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-brand-ink truncate">{c.name}</p>
                        <p className="text-xs text-brand-steel">Saldo de comissão em aberto</p>
                      </div>
                      <b className="tabular-nums text-brand-ink">{brl(c.balance)}</b>
                      <button
                        type="button"
                        onClick={() => go('/financial?tab=mechanics')}
                        className="min-h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border border-line text-brand-graphite hover:bg-surface-muted"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                        Abrir e pagar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex justify-end pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 px-5 inline-flex items-center gap-2 text-sm font-bold rounded-xl bg-brand-ink text-white hover:bg-brand-graphite"
              >
                <LogOut className="w-4 h-4" aria-hidden />
                Sair
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
