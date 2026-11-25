'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Car, CheckCircle2, ChevronRight, ClipboardList, Home, XCircle } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { ErrorState, ListSkeleton, toast } from '@/components/feedback';
import { PageHeader, PageShell } from '@/components/crud';

interface PortalMe {
  user: { name: string; email: string };
  client: {
    id: string;
    name: string;
    phone: string;
    vehicles: { id: string; licensePlate: string; brand: string; model: string; year: number; currentKm: number | null }[];
  };
}

interface PortalOrder {
  id: string;
  code: number;
  status: string;
  finalAmount: string | number;
  createdAt: string;
  reportedIssue: string | null;
  vehicle: { licensePlate: string; brand: string; model: string };
}

const STATUS: Record<string, { label: string; cls: string }> = {
  QUOTE: { label: 'Aguardando sua aprovação', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  APPROVED: { label: 'Aprovado', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  IN_PROGRESS: { label: 'Em execução', cls: 'text-purple-300 bg-purple-500/10 border-purple-500/30' },
  WAITING_PARTS: { label: 'Aguardando peças', cls: 'text-orange-300 bg-orange-500/10 border-orange-500/30' },
  COMPLETED: { label: 'Pronto para retirada', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  BILLED: { label: 'Pago', cls: 'text-emerald-200 bg-emerald-500/20 border-emerald-500/40' },
  CANCELLED: { label: 'Cancelado', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
};

const money = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Portal do Cliente: veículos, orçamentos para aprovar e histórico de OS (só os dados do próprio cliente). */
export default function PortalPage() {
  const [me, setMe] = useState<PortalMe | null>(null);
  const [orders, setOrders] = useState<PortalOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetchApi<PortalMe>('/portal/me', { signal: ctrl.signal }),
      fetchApi<PortalOrder[]>('/portal/work-orders', { signal: ctrl.signal }),
    ])
      .then(([m, o]) => {
        setMe(m);
        setOrders(o);
        setError(null);
      })
      .catch((err) => !ctrl.signal.aborted && setError(err instanceof Error ? err.message : 'Erro ao carregar seus dados.'));
    return () => ctrl.abort();
  }, [reloadKey]);

  async function decide(o: PortalOrder, decision: 'APPROVE' | 'REJECT') {
    let reason: string | undefined;
    if (decision === 'REJECT') {
      const r = prompt(`Recusar o orçamento da OS #${o.code}? Se quiser, conte o motivo:`);
      if (r === null) return;
      reason = r.trim() || undefined;
    } else if (!confirm(`Aprovar o orçamento da OS #${o.code} no valor de ${money(o.finalAmount)}?`)) {
      return;
    }
    try {
      setBusyId(o.id);
      const updated = await fetchApi<{ status: string }>(`/portal/work-orders/${o.id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, reason }),
        successToast:
          decision === 'REJECT' ? 'Orçamento recusado.' : 'Orçamento aprovado! A oficina já foi avisada.',
      });
      if (updated.status === 'WAITING_PARTS') {
        toast.info('Algumas peças estão em falta. A oficina já está providenciando e avisa quando chegarem.');
      }
      setReloadKey((k) => k + 1);
    } catch {
      // o fetchApi já mostra o erro (toast)
    } finally {
      setBusyId(null);
    }
  }

  const quotes = orders?.filter((o) => o.status === 'QUOTE') ?? [];
  const history = orders?.filter((o) => o.status !== 'QUOTE') ?? [];

  return (
    <PageShell width="max-w-4xl">
      <PageHeader
        icon={Home}
        title={me ? `Olá, ${me.client.name.split(' ')[0]}!` : 'Meu portal'}
        description="Acompanhe seus veículos, aprove orçamentos e veja o histórico de serviços."
      />

      {error && !orders ? (
        <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !orders || !me ? (
        <ListSkeleton rows={3} label="Carregando seus dados..." />
      ) : (
        <>
          {/* Orçamentos aguardando aprovação */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Orçamentos para aprovar</h2>
            {quotes.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-4">Nenhum orçamento aguardando você.</p>
            ) : (
              quotes.map((o) => (
                <article key={o.id} className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-white">
                        OS <span className="font-mono text-amber-400">#{o.code}</span> · {o.vehicle.licensePlate}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {o.vehicle.brand} {o.vehicle.model}
                      </div>
                      {o.reportedIssue && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.reportedIssue}</p>}
                    </div>
                    <div className="text-lg font-extrabold text-white whitespace-nowrap">{money(o.finalAmount)}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Link
                      href={`/os/${o.id}`}
                      className="inline-flex items-center justify-center min-h-10 rounded-xl border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                    >
                      Ver detalhes
                    </Link>
                    <button
                      onClick={() => decide(o, 'REJECT')}
                      disabled={busyId === o.id}
                      className="inline-flex items-center justify-center gap-1 min-h-10 rounded-xl border border-rose-500/30 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Recusar
                    </button>
                    <button
                      onClick={() => decide(o, 'APPROVE')}
                      disabled={busyId === o.id}
                      className="inline-flex items-center justify-center gap-1 min-h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Aprovar
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>

          {/* Veículos */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Meus veículos</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {me.client.vehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <Car className="w-5 h-5 text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-amber-400">{v.licensePlate}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {v.brand} {v.model} · {v.year}
                      {v.currentKm ? ` · ${v.currentKm.toLocaleString('pt-BR')} km` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Histórico */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Histórico de serviços</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <ClipboardList className="w-4 h-4 inline mr-1.5" />
                Nenhuma ordem de serviço ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((o) => {
                  const st = STATUS[o.status] ?? { label: o.status, cls: 'text-slate-300 border-slate-700' };
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/os/${o.id}`}
                        className="flex items-center gap-3 bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-amber-400">#{o.code}</span>
                            <span className="text-sm text-white">{o.vehicle.licensePlate}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</div>
                        </div>
                        <span className="text-sm font-semibold text-white whitespace-nowrap">{money(o.finalAmount)}</span>
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
