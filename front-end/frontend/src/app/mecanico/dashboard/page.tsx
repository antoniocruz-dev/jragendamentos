'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Hourglass, Package, Wrench } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { AreaTitle } from '@/components/layout/AreaShell';
import { Badge, Card, CardLink, EmptyState, LightError, LightSkeleton, fieldCls } from '@/components/ui';
import { MECHANIC_LABEL, STATUS_INFO, brDate, brl, type MechanicStatus, type WorkOrderStatus } from '@/lib/os-status';

interface Dashboard {
  month: string;
  counters: { queue: number; running: number; done: number };
  closing: { total_parts: number; total_services: number; grand_total: number };
}
interface OsRow {
  id: string;
  code: number;
  status: WorkOrderStatus;
  mechanicStatus: MechanicStatus | null;
  reopenCount: number;
  reportedIssue: string | null;
  createdAt: string;
  client: { name: string };
  vehicle: { licensePlate: string; brand: string; model: string; year: number };
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const currentMonth = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);

/** Ordem da lista: o que precisa de ação primeiro */
const ORDER: Record<string, number> = { EM_EXECUCAO: 0, EM_TESTE: 1, AGUARDANDO_INICIO: 2, AGUARDANDO_PECA: 3, AGUARDANDO_APROVACAO: 4, CONCLUIDA: 5 };

export default function MecanicoDashboard() {
  const [month, setMonth] = useState(currentMonth);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [orders, setOrders] = useState<OsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'done'>('open');

  const load = useCallback(
    (signal?: AbortSignal) => {
      Promise.all([fetchApi<Dashboard>(`/mecanico/dashboard?month=${month}`, { signal }), fetchApi<OsRow[]>('/mecanico/os', { signal })])
        .then(([d, o]) => {
          setError(null);
          setDash(d);
          setOrders(o);
        })
        .catch((err) => !signal?.aborted && setError(errorMessage(err)));
    },
    [month],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  if (error && !dash) return <LightError message={error} onRetry={() => load()} />;

  const visible = (orders ?? [])
    .filter((o) => (filter === 'done' ? o.mechanicStatus === 'CONCLUIDA' : o.mechanicStatus !== 'CONCLUIDA'))
    .sort((a, b) => (ORDER[a.mechanicStatus ?? ''] ?? 9) - (ORDER[b.mechanicStatus ?? ''] ?? 9));

  return (
    <>
      <AreaTitle title="Minhas O.S" subtitle="Ordens de serviço atribuídas a você" />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Counter label="Na fila" value={dash?.counters.queue} icon={<Hourglass className="w-5 h-5" aria-hidden />} />
        <Counter label="Em execução" value={dash?.counters.running} icon={<Wrench className="w-5 h-5" aria-hidden />} highlight />
        <Counter label="Concluídas no mês" value={dash?.counters.done} icon={<CheckCircle2 className="w-5 h-5" aria-hidden />} />
      </div>

      <Card accent="deep" className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-extrabold">Fechamento do mês</h2>
            <p className="text-xs text-brand-steel">Total das suas O.S concluídas no período</p>
          </div>
          <label className="text-sm font-semibold">
            <span className="sr-only">Mês</span>
            <input type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${fieldCls} w-44`} />
          </label>
        </div>
        {!dash ? (
          <div className="mt-4 h-16 rounded-xl bg-brand-steel/10 animate-pulse" />
        ) : (
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <Total label="Total Peças" value={dash.closing.total_parts} icon={<Package className="w-4 h-4" aria-hidden />} />
            <Total label="Total Serviços" value={dash.closing.total_services} icon={<Wrench className="w-4 h-4" aria-hidden />} />
            <Total label="Total Geral" value={dash.closing.grand_total} strong />
          </dl>
        )}
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="font-extrabold">Ordens de serviço</h2>
        <div className="grid grid-cols-2 bg-surface-white border border-brand-steel/30 rounded-xl p-1 text-sm font-semibold" role="group" aria-label="Filtro">
          {(['open', 'done'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`min-h-11 px-3 rounded-lg transition-colors ${filter === k ? 'bg-brand-graphite text-white' : 'text-brand-graphite'}`}
            >
              {k === 'open' ? 'Em aberto' : 'Concluídas'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        {!orders ? (
          <LightSkeleton rows={3} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" aria-hidden />}
            title={filter === 'open' ? 'Nenhuma O.S em aberto' : 'Nenhuma O.S concluída'}
            text={filter === 'open' ? 'Quando o gestor atribuir uma O.S a você, ela aparece aqui.' : undefined}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {visible.map((o, i) => {
              const info = STATUS_INFO[o.status] ?? STATUS_INFO.DRAFT;
              return (
                <li key={o.id}>
                  <CardLink href={`/mecanico/os/${o.id}`} accent={info.accent} delay={Math.min(i, 8) * 40}>
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        <p className="font-mono text-lg font-extrabold">O.S #{o.code}</p>
                        <p className="text-sm font-semibold truncate">
                          {o.vehicle.brand} {o.vehicle.model} {o.vehicle.year} · {o.vehicle.licensePlate}
                        </p>
                        <p className="text-xs text-brand-steel truncate">{o.client.name}</p>
                      </div>
                      <Badge tone={o.mechanicStatus === 'CONCLUIDA' ? 'deep' : o.mechanicStatus === 'EM_EXECUCAO' ? 'neon' : 'muted'}>
                        {o.mechanicStatus ? MECHANIC_LABEL[o.mechanicStatus] : info.label}
                      </Badge>
                    </div>
                    {o.reportedIssue && <p className="mt-2 text-sm line-clamp-2">{o.reportedIssue}</p>}
                    <p className="mt-2 text-xs text-brand-steel">
                      Aberta em {brDate(o.createdAt)}
                      {o.reopenCount > 0 ? ` · reaberta ${o.reopenCount}x` : ''}
                    </p>
                  </CardLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Counter({ label, value, icon, highlight }: { label: string; value?: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card accent={highlight ? 'neon' : 'graphite'} className="p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-brand-steel">{icon}</div>
      <p className="mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums">{value ?? '—'}</p>
      <p className="text-[11px] sm:text-xs font-semibold text-brand-steel leading-tight">{label}</p>
    </Card>
  );
}

function Total({ label, value, icon, strong }: { label: string; value: number; icon?: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${strong ? 'bg-brand-ink text-white' : 'bg-surface-offwhite'}`}>
      <dt className={`text-xs font-semibold flex items-center gap-1.5 ${strong ? 'text-neon-soft' : 'text-brand-steel'}`}>
        {icon}
        {label}
      </dt>
      <dd className="text-xl font-extrabold tabular-nums">{brl(value)}</dd>
    </div>
  );
}
