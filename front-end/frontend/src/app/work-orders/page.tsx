'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Play, CheckCircle, Share2, Eye, PlusCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { fetchApi } from '@/services/api';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import {
  FormError,
  PageHeader,
  PageShell,
  Pagination,
  SearchInput,
  errorMessage,
  primaryBtnCls,
  useDebouncedValue,
  type Page,
} from '@/components/crud';

// Dicionário de tradução semântica dos status para PT-BR
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  ALL: { label: 'Todas', bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' },
  DRAFT: { label: 'Rascunho', bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30' },
  QUOTE: { label: 'Orçamento', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  APPROVED: { label: 'Aprovado', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  IN_PROGRESS: { label: 'Em Execução', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  WAITING_PARTS: { label: 'Aguardando Peças', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  COMPLETED: { label: 'Finalizado', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  BILLED: { label: 'Pago e Faturado', bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/50' },
  CANCELLED: { label: 'Cancelado', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
};

interface WorkOrder {
  id: string;
  code: number;
  status: string;
  finalAmount: string | number;
  createdAt: string;
  client: { name: string; phone: string };
  vehicle: { licensePlate: string; brand: string; model: string; year: number };
}

type WorkOrderPage = Page<WorkOrder> & { counts: Record<string, number> };

const PAGE_SIZE = 20;
const money = (v: string | number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const statusOf = (status: string) =>
  STATUS_CONFIG[status] || { label: status, bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' };

// Disparo de mensagem pronta e link direto no WhatsApp do cliente
function sendWhatsApp(wo: WorkOrder) {
  const cleanPhone = wo.client.phone.replace(/\D/g, '');
  const phoneWithDDI = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  const osLink = `${window.location.origin}/os/${wo.id}`;

  const message = encodeURIComponent(
    `Olá, *${wo.client.name}*!\n\n` +
      `Aqui é da oficina *JR Agendamentos*.\n` +
      `Sua Ordem de Serviço *#${wo.code}* para o veículo *${wo.vehicle.brand} ${wo.vehicle.model} (${wo.vehicle.licensePlate})* já está disponível.\n\n` +
      `Acesse o link abaixo para visualizar a discriminação de serviços e peças, aprovar o orçamento ou efetuar o pagamento via Pix:\n` +
      `👉 ${osLink}\n\n` +
      `Qualquer dúvida estamos à disposição!`,
  );

  const waHost = ['https://', 'wa', '.me/'].join('');
  window.open(`${waHost}${phoneWithDDI}?text=${message}`, '_blank');
}

function OrderActions({
  wo,
  busy,
  onAdvance,
}: {
  wo: WorkOrder;
  busy: boolean;
  onAdvance: (id: string, next: 'IN_PROGRESS' | 'COMPLETED') => void;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 px-3 min-h-9 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 border whitespace-nowrap';
  return (
    <>
      {wo.status === 'APPROVED' && (
        <button
          onClick={() => onAdvance(wo.id, 'IN_PROGRESS')}
          disabled={busy}
          title="Iniciar Serviço no Box/Elevador"
          className={`${base} bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/30`}
        >
          <Play className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
          Iniciar
        </button>
      )}
      {wo.status === 'IN_PROGRESS' && (
        <button
          onClick={() => onAdvance(wo.id, 'COMPLETED')}
          disabled={busy}
          title="Finalizar Serviço da Oficina"
          className={`${base} bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30`}
        >
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          Finalizar
        </button>
      )}
      <button
        onClick={() => sendWhatsApp(wo)}
        title="Enviar link da OS pelo WhatsApp"
        className={`${base} bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30`}
      >
        <Share2 className="w-3.5 h-3.5" />
        WhatsApp
      </button>
      <Link
        href={`/os/${wo.id}`}
        title="Visualizar OS detalhada e cobrança Pix"
        className={`${base} bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700`}
      >
        <Eye className="w-3.5 h-3.5 text-slate-400" />
        Ver OS
      </Link>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const st = statusOf(status);
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold border whitespace-nowrap ${st.bg} ${st.text} ${st.border}`}>
      {st.label}
    </span>
  );
}

export default function WorkOrdersGeneralPage() {
  // ?status=QUOTE (vindo do Dashboard) pré-seleciona o filtro
  const statusParam = useSearchParams().get('status');
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    statusParam && statusParam in STATUS_CONFIG ? statusParam : 'ALL',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebouncedValue(searchTerm.trim());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WorkOrderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Consulta paginada no servidor: filtro e busca no SQL, só a página visível trafega.
  // O AbortController descarta respostas antigas quando o filtro muda no meio da consulta.
  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (search) params.set('q', search);
    fetchApi<WorkOrderPage>(`/work-orders?${params}`, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [page, statusFilter, search, reloadKey]);

  function changeFilter(next: string) {
    setStatusFilter(next);
    setPage(1);
    setLoading(true);
  }

  function changeSearch(v: string) {
    setSearchTerm(v);
    setPage(1);
  }

  function goToPage(p: number) {
    setPage(p);
    setLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Avanço rápido de status pelo mecânico/atendente
  async function handleAdvanceStatus(workOrderId: string, nextStatus: 'IN_PROGRESS' | 'COMPLETED') {
    const statusLabel = nextStatus === 'IN_PROGRESS' ? 'Em Execução' : 'Finalizado';
    if (!confirm(`Deseja alterar o status desta OS para "${statusLabel}"?`)) return;

    try {
      setActionLoadingId(workOrderId);
      await fetchApi(`/work-orders/${workOrderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      // o aviso de erro já é mostrado pelo fetchApi (toast)
      void err;
    } finally {
      setActionLoadingId(null);
    }
  }

  const orders = data?.items ?? [];
  const counts = data?.counts ?? {};

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardList}
        title="Ordens de Serviço"
        description="Fluxo operacional, autorizações de clientes e liberação de veículos."
        actions={
          <Link href="/work-orders/new" className={primaryBtnCls}>
            <PlusCircle className="w-5 h-5" />
            Nova OS
          </Link>
        }
      />

      {/* Busca + abas de status (rolagem horizontal no celular, com contagem por status) */}
      <div className="space-y-3">
        <SearchInput value={searchTerm} onChange={changeSearch} placeholder="Placa, cliente ou nº da OS..." className="w-full sm:max-w-sm" />
        <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1.5 w-max pb-1">
            {Object.keys(STATUS_CONFIG).map((statusKey) => {
              const isSelected = statusFilter === statusKey;
              return (
                <button
                  key={statusKey}
                  onClick={() => changeFilter(statusKey)}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-1.5 px-3 min-h-9 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors ${
                    isSelected ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  {STATUS_CONFIG[statusKey].label}
                  {data && (
                    <span className={`tabular-nums rounded-full px-1.5 text-[10px] ${isSelected ? 'bg-slate-950/20' : 'bg-slate-800 text-slate-400'}`}>
                      {counts[statusKey] ?? 0}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && data && <FormError message={error} />}

      <div className={`transition-opacity ${loading && data ? 'opacity-60' : ''}`} aria-busy={loading}>
        {loading && !data ? (
          <ListSkeleton rows={5} label="Carregando Ordens de Serviço..." />
        ) : error && !data ? (
          <ErrorState
            message={`Não foi possível carregar as Ordens de Serviço: ${error}`}
            onRetry={() => {
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
            <ClipboardList className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-300">Nenhuma Ordem de Serviço encontrada</p>
            <p className="text-xs text-slate-500 mt-1">Ajuste os filtros ou crie uma nova OS.</p>
          </div>
        ) : (
          <>
            {/* Celular: cards */}
            <ul className="md:hidden space-y-3">
              {orders.map((wo) => (
                <li key={wo.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">#{wo.code}</span>
                        <span className="font-bold text-white uppercase tracking-wide">{wo.vehicle.licensePlate}</span>
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {wo.vehicle.brand} {wo.vehicle.model} ({wo.vehicle.year})
                      </div>
                    </div>
                    <StatusBadge status={wo.status} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <div className="font-medium text-white truncate">{wo.client.name}</div>
                      <div className="text-xs text-slate-400">{new Date(wo.createdAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div className="font-bold text-white whitespace-nowrap">{money(wo.finalAmount)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                    <OrderActions wo={wo} busy={actionLoadingId === wo.id} onAdvance={handleAdvanceStatus} />
                  </div>
                </li>
              ))}
            </ul>

            {/* Tablet/desktop: tabela */}
            <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="scroll-x">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/80 text-xs uppercase font-bold text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4">OS #</th>
                      <th className="py-3.5 px-4">Veículo / Placa</th>
                      <th className="py-3.5 px-4">Cliente</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Valor</th>
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {orders.map((wo) => (
                      <tr key={wo.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-400">#{wo.code}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white uppercase tracking-wide">{wo.vehicle.licensePlate}</div>
                          <div className="text-xs text-slate-400">
                            {wo.vehicle.brand} {wo.vehicle.model} ({wo.vehicle.year})
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-white">{wo.client.name}</div>
                          <div className="text-xs text-slate-400">{wo.client.phone}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={wo.status} />
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap text-right">{money(wo.finalAmount)}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <OrderActions wo={wo} busy={actionLoadingId === wo.id} onAdvance={handleAdvanceStatus} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={goToPage} loading={loading} />}
    </PageShell>
  );
}
