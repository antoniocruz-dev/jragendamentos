'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Wallet } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { Field, FormError, Modal, errorMessage, inputCls } from '@/components/crud';
import { brDate, brl, sumMoney, type CommissionStatement, type StaffOption } from '@/services/financial';

type Scope = 'orders' | 'week' | 'month';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Período (horário local, dia inteiro) de cada tipo de recibo. */
function rangeFor(scope: Scope, day: string, month: string, from: string, to: string) {
  if (scope === 'week') {
    const ref = parseYmd(day);
    const start = new Date(ref);
    start.setDate(ref.getDate() - ((ref.getDay() + 6) % 7)); // segunda-feira
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // domingo
    return { start, end };
  }
  if (scope === 'month') {
    const [y, m] = month.split('-').map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }
  return { start: parseYmd(from), end: parseYmd(to) };
}

/**
 * Recibo de pagamento de comissão do mecânico: por O.S. (seleção de várias), semanal ou mensal.
 * Os valores vêm do backend (computeOrder); a tela só mostra e gera o PDF para imprimir e assinar.
 */
export function CommissionReceiptModal({
  staff,
  defaultMechanicId,
  onClose,
  onRegisterPayment,
}: {
  staff: StaffOption[];
  defaultMechanicId?: string;
  onClose: () => void;
  onRegisterPayment: (p: { id: string; name: string; amount: number; description: string }) => void;
}) {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 30);

  // Qualquer pessoa da equipe pode ser responsável por uma O.S: mecânicos primeiro, depois os demais
  const options = useMemo(() => {
    const isMech = (s: StaffOption) => s.profile === 'MECANICO' || s.profile === 'MECANICO_CHEFE';
    return [...staff.filter(isMech), ...staff.filter((s) => !isMech(s))];
  }, [staff]);
  const [mechanicId, setMechanicId] = useState(defaultMechanicId ?? options[0]?.id ?? '');
  const [scope, setScope] = useState<Scope>('orders');
  const [day, setDay] = useState(ymd(today));
  const [month, setMonth] = useState(ymd(today).slice(0, 7));
  const [from, setFrom] = useState(ymd(monthAgo));
  const [to, setTo] = useState(ymd(today));
  const [data, setData] = useState<CommissionStatement | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { start, end } = rangeFor(scope, day, month, from, to);
  const startKey = ymd(start);
  const endKey = ymd(end);

  useEffect(() => {
    if (!mechanicId || !startKey || !endKey) return;
    let alive = true;
    const s = parseYmd(startKey);
    const e = parseYmd(endKey);
    e.setHours(23, 59, 59, 999);
    const qs = new URLSearchParams({ mechanicId, from: s.toISOString(), to: e.toISOString() });
    // Carregamento assíncrono: o estado só muda quando a resposta chega
    Promise.resolve()
      .then(() => {
        if (!alive) return null;
        setLoading(true);
        setError(null);
        return fetchApi<CommissionStatement>(`/financial/commission-statement?${qs}`, { errorToast: false });
      })
      .then((res) => {
        if (!alive || !res) return;
        setData(res);
        setSelected(new Set(res.orders.map((o) => o.id)));
      })
      .catch((err: unknown) => alive && setError(errorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [mechanicId, startKey, endKey]);

  const rows = data?.orders ?? [];
  const chosen = scope === 'orders' ? rows.filter((o) => selected.has(o.id)) : rows;
  const previewTotal = sumMoney(chosen.map((o) => o.commission));
  const periodText = `${brDate(startKey)} a ${brDate(endKey)}`;
  const scopeText =
    scope === 'orders'
      ? `O.S ${chosen.map((o) => `#${o.code}`).join(', ')}`
      : scope === 'week'
        ? `Semana de ${periodText}`
        : `Mês ${month.split('-').reverse().join('/')}`;

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    if (!data || chosen.length === 0) return;
    try {
      setPrinting(true);
      setError(null);
      // O total do recibo vem do backend (soma em Decimal das comissões das O.S. escolhidas)
      const statement =
        scope === 'orders'
          ? await fetchApi<CommissionStatement>(
              `/financial/commission-statement?${new URLSearchParams({ mechanicId, orderIds: chosen.map((o) => o.id).join(',') })}`,
              { errorToast: false },
            )
          : data;
      await (await import('@/lib/export-pdf')).exportCommissionReceiptPdf(statement, scopeText);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setPrinting(false);
    }
  }

  const mechanicName = options.find((m) => m.id === mechanicId)?.name ?? data?.mechanic.name ?? '';

  return (
    <Modal title="Recibo de comissão" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Mecânico">
            <select value={mechanicId} onChange={(e) => setMechanicId(e.target.value)} className={inputCls} required>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de recibo">
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={inputCls}>
              <option value="orders">Por O.S (escolher quais)</option>
              <option value="week">Semanal</option>
              <option value="month">Mensal</option>
            </select>
          </Field>
          {scope === 'orders' && (
            <>
              <Field label="O.S faturadas de">
                <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} />
              </Field>
              <Field label="até">
                <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} />
              </Field>
            </>
          )}
          {scope === 'week' && (
            <Field label="Qualquer dia da semana" hint={`Semana de segunda a domingo: ${periodText}`}>
              <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className={inputCls} />
            </Field>
          )}
          {scope === 'month' && (
            <Field label="Mês">
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputCls} />
            </Field>
          )}
        </div>

        <FormError message={error} />

        <section className="border border-line-soft rounded-xl overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-[11px] uppercase text-brand-graphite bg-surface-offwhite/60">
              <tr>
                {scope === 'orders' && <th className="px-3 py-2 w-8" aria-label="Incluir" />}
                <th className="px-3 py-2 text-left">O.S</th>
                <th className="px-3 py-2 text-left">Faturada</th>
                <th className="px-3 py-2 text-left">Veículo</th>
                <th className="px-3 py-2 text-right">Mão de obra</th>
                <th className="px-3 py-2 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft/80">
              {loading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-brand-steel">
                    <Loader2 className="w-4 h-4 animate-spin inline" aria-hidden /> Carregando...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-brand-steel">
                    Nenhuma O.S faturada deste mecânico no período.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((o) => (
                  <tr key={o.id} className={scope === 'orders' && !selected.has(o.id) ? 'opacity-50' : ''}>
                    {scope === 'orders' && (
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggle(o.id)}
                          aria-label={`Incluir O.S #${o.code}`}
                          className="w-4 h-4 accent-neon-deep"
                        />
                      </td>
                    )}
                    <td className="px-3 py-1.5 font-mono">#{o.code}</td>
                    <td className="px-3 py-1.5">{brDate(o.date)}</td>
                    <td className="px-3 py-1.5 text-brand-graphite">{o.vehicle}</td>
                    <td className="px-3 py-1.5 text-right">{brl(o.labor)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold" title={`${o.commissionRate}%`}>
                      {brl(o.commission)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            Total do recibo: <b className="text-lg tabular-nums">{brl(previewTotal)}</b>{' '}
            <span className="text-brand-steel">({chosen.length} O.S)</span>
          </p>
          {data && (
            <p className="text-brand-steel">
              Saldo de comissão em aberto (todo o histórico): <b className="text-brand-ink tabular-nums">{brl(data.balance.balance)}</b>
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-line-soft">
          <button
            type="button"
            disabled={chosen.length === 0 || previewTotal <= 0}
            onClick={() =>
              onRegisterPayment({
                id: mechanicId,
                name: mechanicName,
                amount: previewTotal,
                description: `Comissão ${scopeText}`.slice(0, 255),
              })
            }
            className="min-h-11 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-xl border border-line text-brand-graphite hover:bg-surface-muted hover:text-brand-ink disabled:opacity-50"
          >
            <Wallet className="w-4 h-4" aria-hidden />
            Registrar pagamento
          </button>
          <button
            type="button"
            disabled={chosen.length === 0 || printing}
            onClick={generate}
            className="min-h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-bold rounded-xl bg-neon-primary hover:bg-neon-soft text-brand-ink disabled:opacity-60"
          >
            {printing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <FileText className="w-4 h-4" aria-hidden />}
            Gerar recibo para imprimir
          </button>
        </div>
      </div>
    </Modal>
  );
}
