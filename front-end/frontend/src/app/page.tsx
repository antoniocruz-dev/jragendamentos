'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Plus, ClipboardList, DollarSign, Calendar, Loader2, AlertCircle, AlertTriangle, PackageX, Undo2, X } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { useAuth } from '@/services/auth';
import { hasModule, type AppModule } from '@/services/permissions';

// ==========================================
// Tipos da API /dashboard/summary
// ==========================================

interface Summary {
  period: { from: string; to: string };
  workOrders: { status: string; count: number; amount: number }[];
  appointments: { status: string; count: number }[];
  revenue: { orders: number; services: number; products: number; discount: number; total: number } | null;
  alerts?: {
    lowStock: { id: string; name: string; sku: string; stockQuantity: number; minStock: number }[];
    items: { id: string; type: 'STOCK_SHORTAGE' | 'PAYMENT_REJECTED'; message: string; createdAt: string; workOrderId: string | null }[];
    pendingRefunds: number;
  };
}

/** Avisos da operação: estoque baixo, OS aguardando peças, pagamento recusado e estornos pendentes. */
function AlertsPanel({ alerts, onResolved }: { alerts: NonNullable<Summary['alerts']>; onResolved: () => void }) {
  const total = alerts.lowStock.length + alerts.items.length + (alerts.pendingRefunds ? 1 : 0);
  if (!total) return null;

  async function dismiss(id: string) {
    try {
      await fetchApi(`/dashboard/alerts/${id}/resolve`, { method: 'PATCH', successToast: 'Alerta resolvido.' });
      onResolved();
    } catch {
      // erro já exibido pelo fetchApi
    }
  }

  return (
    <section className="bg-slate-900 border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-3" aria-label="Alertas">
      <h2 className="flex items-center gap-2 text-sm font-bold text-amber-300">
        <AlertTriangle className="w-4 h-4" />
        Alertas ({total})
      </h2>
      <ul className="space-y-2 text-sm">
        {alerts.pendingRefunds > 0 && (
          <li>
            <Link href="/financial?tab=refunds" className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2.5 text-rose-200 hover:border-rose-400">
              <Undo2 className="w-4 h-4 shrink-0" />
              <span className="flex-1">
                {alerts.pendingRefunds} OS faturada(s) cancelada(s) aguardando estorno manual
              </span>
            </Link>
          </li>
        )}
        {alerts.items.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
            <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${a.type === 'PAYMENT_REJECTED' ? 'text-rose-400' : 'text-orange-400'}`} />
            {a.workOrderId ? (
              <Link href={`/os/${a.workOrderId}`} className="flex-1 min-w-0 text-slate-200 hover:text-white break-words">
                {a.message}
              </Link>
            ) : (
              <span className="flex-1 min-w-0 text-slate-200 break-words">{a.message}</span>
            )}
            <button onClick={() => dismiss(a.id)} className="shrink-0 p-1 -m-1 text-slate-500 hover:text-white" aria-label="Marcar alerta como resolvido">
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
        {alerts.lowStock.length > 0 && (
          <li className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
            <Link href="/catalog?tab=products" className="flex items-center gap-2.5 text-orange-200 hover:text-white">
              <PackageX className="w-4 h-4 shrink-0" />
              <span className="font-semibold">Estoque baixo ({alerts.lowStock.length})</span>
            </Link>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {alerts.lowStock.map((p) => (
                <span key={p.id} className={`text-xs px-2 py-1 rounded-lg border ${p.stockQuantity <= 0 ? 'border-rose-500/40 text-rose-300' : 'border-orange-500/30 text-orange-200'}`}>
                  {p.name}: {p.stockQuantity} (mín. {p.minStock})
                </span>
              ))}
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  href: string;
}

// Paleta categórica (ordem fixa, validada para fundo escuro). A cor segue a entidade, nunca a posição.
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
const SURFACE = '#0f172a'; // fundo dos cartões (slate-900): separa as fatias

const WO_STATUS: { key: string; label: string }[] = [
  { key: 'DRAFT', label: 'Rascunho' },
  { key: 'QUOTE', label: 'Orçamento' },
  { key: 'APPROVED', label: 'Aprovada' },
  { key: 'IN_PROGRESS', label: 'Em execução' },
  { key: 'WAITING_PARTS', label: 'Aguardando peças' },
  { key: 'COMPLETED', label: 'Concluída' },
  { key: 'BILLED', label: 'Faturada / paga' },
  { key: 'CANCELLED', label: 'Cancelada' },
];

const APPT_STATUS: { key: string; label: string }[] = [
  { key: 'PENDING', label: 'Pendente' },
  { key: 'CONFIRMED', label: 'Confirmado' },
  { key: 'ATTENDED', label: 'Compareceu' },
  { key: 'CANCELLED', label: 'Cancelado' },
];

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const int = (v: number) => v.toLocaleString('pt-BR');

// ==========================================
// Período
// ==========================================

type Preset = 'today' | '7d' | 'month' | '30d' | 'year' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: 'month', label: 'Este mês' },
  { key: '30d', label: '30 dias' },
  { key: 'year', label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
];

function toInputDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today);
  if (preset === '7d') start.setDate(today.getDate() - 6);
  if (preset === '30d') start.setDate(today.getDate() - 29);
  if (preset === 'month') start.setDate(1);
  if (preset === 'year') start.setMonth(0, 1);
  return { from: toInputDate(start), to: toInputDate(today) };
}

/** Datas do filtro (AAAA-MM-DD, fuso local) → intervalo ISO do dia inteiro. */
function toIsoRange(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return {
    from: new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString(),
    to: new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString(),
  };
}

// ==========================================
// Página
// ==========================================

const subscribeNoop = () => () => {};

export default function DashboardPage() {
  // Datas só existem no navegador (o prerender não pode usar o relógio)
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  if (!isClient) return <LoadingBlock />;
  return <Dashboard />;
}

function LoadingBlock() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const modules = user?.modules;
  const can = (m: AppModule) => hasModule(modules, m);

  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const invalidRange = !range.from || !range.to || range.from > range.to;

  useEffect(() => {
    if (invalidRange) return;
    let cancelled = false;
    const params = new URLSearchParams(toIsoRange(range.from, range.to));
    fetchApi<Summary>(`/dashboard/summary?${params}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Falha ao carregar o Dashboard.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, invalidRange, reloadKey]);

  function choosePreset(p: Preset) {
    setPreset(p);
    if (p !== 'custom') {
      setLoading(true);
      setRange(presetRange(p));
    }
  }

  function changeDate(field: 'from' | 'to', value: string) {
    setPreset('custom');
    setLoading(true);
    setRange((r) => ({ ...r, [field]: value }));
  }

  const woSlices: Slice[] = useMemo(
    () =>
      WO_STATUS.map((s, i) => ({
        key: s.key,
        label: s.label,
        value: data?.workOrders.find((w) => w.status === s.key)?.count ?? 0,
        color: SERIES[i],
        href: `/work-orders?status=${s.key}`,
      })),
    [data],
  );

  const revenueSlices: Slice[] = useMemo(
    () =>
      data?.revenue
        ? [
            { key: 'services', label: 'Serviços (mão de obra)', value: data.revenue.services, color: SERIES[0], href: '/work-orders?status=BILLED' },
            { key: 'products', label: 'Peças', value: data.revenue.products, color: SERIES[1], href: '/work-orders?status=BILLED' },
          ]
        : [],
    [data],
  );

  // Semana que a Agenda abre: hoje, se estiver no período; senão o início do período
  const today = toInputDate(new Date());
  const agendaDate = today >= range.from && today <= range.to ? today : range.from;

  const apptSlices: Slice[] = useMemo(
    () =>
      APPT_STATUS.map((s, i) => ({
        key: s.key,
        label: s.label,
        value: data?.appointments.find((a) => a.status === s.key)?.count ?? 0,
        color: SERIES[i],
        href: `/appointments?status=${s.key}&date=${agendaDate}`,
      })),
    [data, agendaDate],
  );

  const totalOrders = woSlices.reduce((a, s) => a + s.value, 0);
  const inShop = woSlices
    .filter((s) => ['APPROVED', 'IN_PROGRESS', 'WAITING_PARTS'].includes(s.key))
    .reduce((a, s) => a + s.value, 0);
  const totalAppts = apptSlices.reduce((a, s) => a + s.value, 0);

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-4 sm:pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white flex items-center gap-2.5">
              <LayoutDashboard className="w-6 h-6 sm:w-7 sm:h-7 text-amber-500 shrink-0" />
              Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Visão do período. Clique numa fatia ou na legenda para abrir a tela correspondente.
            </p>
          </div>
          {can('WORK_ORDERS') && (
            <Link
              href="/work-orders/new"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl sm:self-end"
            >
              <Plus className="w-4 h-4" />
              Nova Ordem de Serviço
            </Link>
          )}
        </header>

        {/* Filtro de período */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-3">
          <div className="flex gap-1.5 scroll-x -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap pb-1 sm:pb-0">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => choosePreset(p.key)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  preset === p.key
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center lg:ml-auto text-sm">
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-slate-400 min-w-0">
              De
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => changeDate('from', e.target.value)}
                className="w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 sm:py-1.5 text-slate-200 [color-scheme:dark]"
              />
            </label>
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-slate-400 min-w-0">
              até
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => changeDate('to', e.target.value)}
                className="w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 sm:py-1.5 text-slate-200 [color-scheme:dark]"
              />
            </label>
          </div>
        </div>

        {data?.alerts && <AlertsPanel alerts={data.alerts} onResolved={() => setReloadKey((k) => k + 1)} />}

        {invalidRange ? (
          <Notice text="Escolha uma data inicial anterior à data final." />
        ) : error ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm text-slate-300">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
              className="text-sm font-semibold text-amber-400 hover:text-amber-300"
            >
              Tentar novamente
            </button>
          </div>
        ) : !data ? (
          <LoadingBlock />
        ) : (
          <div className={`grid gap-6 md:grid-cols-2 ${data.revenue ? 'xl:grid-cols-3' : ''} transition-opacity ${loading ? 'opacity-50' : ''}`}>
            <PieCard
              title="Ordens de Serviço por status"
              subtitle="OS abertas no período"
              icon={ClipboardList}
              slices={woSlices}
              format={int}
              centerValue={int(totalOrders)}
              centerLabel="OS no período"
              footer={`${int(inShop)} no pátio (aprovadas, em execução ou aguardando peças)`}
              canOpen={can('WORK_ORDERS')}
              emptyText="Nenhuma OS aberta neste período."
            />
            {data.revenue && (
              <PieCard
                title="Faturamento"
                subtitle={`${int(data.revenue.orders)} OS faturadas e pagas no período`}
                icon={DollarSign}
                slices={revenueSlices}
                format={brl}
                centerValue={brl(data.revenue.total)}
                centerLabel="líquido"
                footer={data.revenue.discount > 0 ? `Descontos concedidos: ${brl(data.revenue.discount)}` : 'Somente OS com status Faturada / paga'}
                canOpen={can('WORK_ORDERS')}
                emptyText="Nenhuma OS faturada neste período."
              />
            )}
            <PieCard
              title="Agendamentos por status"
              subtitle="Pela data agendada"
              icon={Calendar}
              slices={apptSlices}
              format={int}
              centerValue={int(totalAppts)}
              centerLabel={totalAppts === 1 ? 'agendamento' : 'agendamentos'}
              footer={`${int(apptSlices.find((s) => s.key === 'ATTENDED')?.value ?? 0)} compareceram`}
              canOpen={can('APPOINTMENTS')}
              emptyText="Nenhum agendamento neste período."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">{text}</div>;
}

// ==========================================
// Gráfico de pizza (rosca) clicável
// ==========================================

function arcPath(cx: number, cy: number, r: number, inner: number, start: number, end: number) {
  const pt = (radius: number, angle: number) => [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = pt(r, start);
  const [x2, y2] = pt(r, end);
  const [x3, y3] = pt(inner, end);
  const [x4, y4] = pt(inner, start);
  return `M${x1} ${y1}A${r} ${r} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${inner} ${inner} 0 ${large} 0 ${x4} ${y4}Z`;
}

function PieCard({
  title,
  subtitle,
  icon: Icon,
  slices,
  format,
  centerValue,
  centerLabel,
  footer,
  canOpen,
  emptyText,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  slices: Slice[];
  format: (v: number) => string;
  centerValue: string;
  centerLabel: string;
  footer: string;
  canOpen: boolean;
  emptyText: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const visible = slices.filter((s) => s.value > 0);

  const size = 220;
  const c = size / 2;
  const r = c - 4;
  const inner = r * 0.6;

  const arcs = visible.reduce<(Slice & { start: number; end: number })[]>((acc, s) => {
    const start = acc.length ? acc[acc.length - 1].end : 0;
    acc.push({ ...s, start, end: start + (s.value / total) * Math.PI * 2 });
    return acc;
  }, []);

  const hovered = visible.find((s) => s.key === hover);
  const pct = (v: number) => (total ? `${((v / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%');
  const open = (s: Slice) => canOpen && router.push(s.href);

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
      <div className="flex items-start gap-3 mb-4">
        <div className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-slate-300">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center py-16 text-sm text-slate-500 text-center">{emptyText}</div>
      ) : (
        <>
          <div className="relative mx-auto" style={{ width: size, height: size }}>
            <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${title}: ${centerValue}`}>
              {arcs.length === 1 ? (
                <path
                  d={`M${c} ${c - r}A${r} ${r} 0 1 1 ${c - 0.01} ${c - r}L${c - 0.01} ${c - inner}A${inner} ${inner} 0 1 0 ${c} ${c - inner}Z`}
                  fill={arcs[0].color}
                  className={canOpen ? 'cursor-pointer' : ''}
                  onMouseEnter={() => setHover(arcs[0].key)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => open(arcs[0])}
                />
              ) : (
                arcs.map((a) => (
                  <path
                    key={a.key}
                    d={arcPath(c, c, hover === a.key ? r + 3 : r, inner, a.start, a.end)}
                    fill={a.color}
                    stroke={SURFACE}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    opacity={hover && hover !== a.key ? 0.45 : 1}
                    className={`transition-opacity ${canOpen ? 'cursor-pointer' : ''}`}
                    onMouseEnter={() => setHover(a.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => open(a)}
                  >
                    <title>{`${a.label}: ${format(a.value)} (${pct(a.value)})`}</title>
                  </path>
                ))
              )}
            </svg>
            {/* Centro: total ou fatia sob o mouse */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-12">
              <div className="text-lg font-extrabold text-white leading-tight">
                {hovered ? format(hovered.value) : centerValue}
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                {hovered ? `${hovered.label} · ${pct(hovered.value)}` : centerLabel}
              </div>
            </div>
          </div>

          {/* Legenda = tabela de valores (também clicável) */}
          <ul className="mt-5 space-y-1">
            {slices.map((s) => {
              const disabled = s.value === 0 || !canOpen;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => open(s)}
                    onMouseEnter={() => setHover(s.key)}
                    onMouseLeave={() => setHover(null)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left ${
                      disabled ? 'cursor-default' : 'hover:bg-slate-800'
                    } ${hover === s.key ? 'bg-slate-800' : ''} ${s.value === 0 ? 'opacity-40' : ''}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="flex-1 text-slate-300 truncate">{s.label}</span>
                    <span className="font-semibold text-white tabular-nums">{format(s.value)}</span>
                    <span className="w-12 text-right text-xs text-slate-500 tabular-nums">{pct(s.value)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-500">
        {footer}
        {!canOpen && ' · Seu perfil não acessa a tela de detalhes.'}
      </p>
    </section>
  );
}
