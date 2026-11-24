'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Undo2,
  Wallet,
  Users,
  ClipboardList,
  Receipt,
  Settings2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { fetchApi } from '@/services/api';
import { useAuth } from '@/services/auth';
import { canManageRecords } from '@/services/permissions';
import { ActionBtn, Field, FormError, Modal, ModalActions, errorMessage, inputCls } from '@/components/crud';
import {
  GROUP_LABELS,
  PAYMENT_OPTIONS,
  brDate,
  brl,
  pctFmt,
  type ExpenseRow,
  type FinancialMeta,
  type FinancialReport,
  type FinancialSettings,
  type GroupBy,
  type OrderClosing,
  type StaffOption,
} from '@/services/financial';

// ==========================================
// Período
// ==========================================

type Preset = 'week' | 'month' | 'lastMonth' | 'year' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês anterior' },
  { key: 'year', label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(p: Exclude<Preset, 'custom'>) {
  const t = new Date();
  if (p === 'week') {
    const start = new Date(t);
    start.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // segunda-feira
    return { from: ymd(start), to: ymd(t) };
  }
  if (p === 'lastMonth') {
    const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const end = new Date(t.getFullYear(), t.getMonth(), 0);
    return { from: ymd(start), to: ymd(end) };
  }
  if (p === 'year') return { from: `${t.getFullYear()}-01-01`, to: ymd(t) };
  return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) };
}

function isoRange(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return { from: new Date(fy, fm - 1, fd).toISOString(), to: new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString() };
}

type Tab = 'summary' | 'orders' | 'mechanics' | 'expenses' | 'settings';
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'summary', label: 'Resumo e ISS', icon: DollarSign },
  { key: 'orders', label: 'Ordens de Serviço', icon: ClipboardList },
  { key: 'mechanics', label: 'Produção dos mecânicos', icon: Users },
  { key: 'expenses', label: 'Despesas', icon: Receipt },
  { key: 'settings', label: 'Configuração fiscal', icon: Settings2 },
];

const subscribeNoop = () => () => {};

export default function FinancialPage() {
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  if (!isClient) return <Spinner />;
  return <Financial />;
}

function Spinner() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

function Financial() {
  const { user } = useAuth();
  const isManager = canManageRecords(user);

  const [tab, setTab] = useState<Tab>('summary');
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [mechanicId, setMechanicId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [meta, setMeta] = useState<FinancialMeta | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const invalidRange = !range.from || !range.to || range.from > range.to;
  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Busca com pequena espera para não consultar a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchApi<StaffOption[]>('/financial/staff').then(setStaff).catch(() => setStaff([]));
    fetchApi<FinancialMeta>('/financial/meta').then(setMeta).catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    if (invalidRange) return;
    let cancelled = false;
    const params = new URLSearchParams({ ...isoRange(range.from, range.to), groupBy });
    if (mechanicId) params.set('mechanicId', mechanicId);
    if (paymentMethod) params.set('paymentMethod', paymentMethod);
    if (q) params.set('q', q);
    fetchApi<FinancialReport>(`/financial/report?${params}`)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setError(null);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, groupBy, mechanicId, paymentMethod, q, invalidRange, reloadKey]);

  const filtersText = useMemo(() => {
    const parts = [`Agrupado por ${GROUP_LABELS[groupBy].toLowerCase()}`];
    if (mechanicId) parts.push(`Mecânico: ${mechanicId === 'none' ? 'sem mecânico' : staff.find((s) => s.id === mechanicId)?.name ?? ''}`);
    if (paymentMethod) parts.push(`Pagamento: ${PAYMENT_OPTIONS.find((p) => p.key === paymentMethod)?.label}`);
    if (q) parts.push(`Busca: "${q}"`);
    return parts.join(' • ');
  }, [groupBy, mechanicId, paymentMethod, q, staff]);

  function choosePreset(p: Preset) {
    setPreset(p);
    if (p !== 'custom') {
      setLoading(true);
      setRange(presetRange(p));
      setGroupBy(p === 'year' ? 'month' : p === 'week' ? 'week' : groupBy);
    }
  }

  async function runExport(kind: 'excel' | 'pdf') {
    if (!report) return;
    try {
      setExporting(kind);
      if (kind === 'excel') await (await import('@/lib/export-excel')).exportFinancialExcel(report, filtersText);
      else await (await import('@/lib/export-pdf')).exportFinancialPdf(report, filtersText);
    } catch (err) {
      alert(`Não foi possível gerar o arquivo: ${errorMessage(err)}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
              <Wallet className="w-8 h-8 text-amber-500" />
              Financeiro
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Gestão interna: faturamento, custo de peças, mão de obra, ISS, comissões e despesas. Não compartilhe com clientes.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => runExport('excel')}
              disabled={!report || !!exporting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-50"
            >
              {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Excel
            </button>
            <button
              onClick={() => runExport('pdf')}
              disabled={!report || !!exporting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-rose-600/15 text-rose-300 border border-rose-500/30 hover:bg-rose-600/25 disabled:opacity-50"
            >
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              PDF
            </button>
          </div>
        </header>

        {/* Filtros */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => choosePreset(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    preset === p.key ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 xl:ml-auto text-sm">
              <label className="flex items-center gap-1.5 text-slate-400">
                De
                <input type="date" value={range.from} max={range.to} onChange={(e) => { setPreset('custom'); setLoading(true); setRange((r) => ({ ...r, from: e.target.value })); }} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 [color-scheme:dark]" />
              </label>
              <label className="flex items-center gap-1.5 text-slate-400">
                até
                <input type="date" value={range.to} min={range.from} onChange={(e) => { setPreset('custom'); setLoading(true); setRange((r) => ({ ...r, to: e.target.value })); }} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 [color-scheme:dark]" />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <select value={groupBy} onChange={(e) => { setLoading(true); setGroupBy(e.target.value as GroupBy); }} className={inputCls} aria-label="Agrupar por">
              <option value="week">Agrupar por semana</option>
              <option value="month">Agrupar por mês</option>
              <option value="year">Agrupar por ano</option>
            </select>
            <select value={mechanicId} onChange={(e) => { setLoading(true); setMechanicId(e.target.value); }} className={inputCls} aria-label="Mecânico">
              <option value="">Todos os mecânicos</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="none">Sem mecânico</option>
            </select>
            <select value={paymentMethod} onChange={(e) => { setLoading(true); setPaymentMethod(e.target.value); }} className={inputCls} aria-label="Forma de pagamento">
              <option value="">Todas as formas de pagamento</option>
              {PAYMENT_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, placa ou nº da OS" className={inputCls} />
          </div>
        </section>

        <nav className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap ${
                tab === key ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        {tab === 'settings' ? (
          <SettingsTab isManager={isManager} meta={meta} onSaved={reload} />
        ) : invalidRange ? (
          <Box>Escolha uma data inicial anterior à data final.</Box>
        ) : error ? (
          <Box>
            <AlertCircle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
            <p className="text-rose-300">{error}</p>
            <button onClick={reload} className="mt-2 text-sm font-semibold text-amber-400">Tentar novamente</button>
          </Box>
        ) : !report ? (
          <Spinner />
        ) : (
          <div className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            {tab === 'summary' && <SummaryTab report={report} />}
            {tab === 'orders' && <OrdersTab report={report} isManager={isManager} onChanged={reload} />}
            {tab === 'mechanics' && <MechanicsTab report={report} staff={staff} meta={meta} onChanged={reload} />}
            {tab === 'expenses' && <ExpensesTab report={report} staff={staff} meta={meta} isManager={isManager} onChanged={reload} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">{children}</div>;
}

function Card({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'neutral' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-white';
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-[11px] font-bold tracking-wide text-slate-400 uppercase">{label}</div>
      <div className={`text-xl font-extrabold mt-1 tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

// ==========================================
// Resumo e ISS
// ==========================================

function SummaryTab({ report }: { report: FinancialReport }) {
  const s = report.summary;
  const st = report.settings;
  const dre: { label: string; value: number | null; strong?: boolean; hint?: string }[] = [
    { label: '(+) Venda de peças (líquida de descontos)', value: s.partsSale },
    { label: '(+) Mão de obra (líquida de descontos)', value: s.labor },
    { label: '(=) Total faturado', value: s.totalBilled, strong: true },
    { label: '(-) Custo das peças (custo de saída)', value: -s.partsCost },
    { label: '(=) Lucro bruto oficina', value: s.grossProfit, strong: true },
    { label: `(-) ISS sobre a mão de obra`, value: -s.iss, hint: `${st.municipality} • item ${st.serviceCode} • alíquota atual ${pctFmt(st.issRate)}` },
    { label: '(-) Comissões dos mecânicos', value: -s.commission },
    { label: '(-) Despesas operacionais', value: s.operationalExpenses === null ? null : -s.operationalExpenses, hint: 'Pagamentos de comissão não entram aqui (já descontados acima)' },
    { label: '(=) Resultado da oficina', value: s.result, strong: true, hint: 'Antes de IRPJ/CSLL e demais tributos sobre o lucro' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Card label="Total faturado" value={brl(s.totalBilled)} hint={`${s.orders} OS • ticket ${brl(s.averageTicket)}`} />
        <Card label="Custo total peças" value={brl(s.partsCost)} />
        <Card label="Lucro total peças" value={brl(s.partsProfit)} tone={s.partsProfit < 0 ? 'bad' : 'neutral'} />
        <Card label="Total mão de obra" value={brl(s.labor)} />
        <Card label="Lucro bruto oficina" value={brl(s.grossProfit)} hint={`Margem ${pctFmt(s.grossMargin)}`} tone="good" />
        <Card label="ISS (gestão)" value={brl(s.iss)} hint={`${pctFmt(st.issRate)} sobre mão de obra`} />
        <Card label="Comissões" value={brl(s.commission)} />
        <Card label="Resultado" value={s.result === null ? 'n/a' : brl(s.result)} hint={s.result === null ? 'Relatório filtrado' : 'Após ISS, comissões e despesas'} tone={s.result !== null && s.result < 0 ? 'bad' : 'good'} />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <h2 className="px-4 py-3 font-bold text-white border-b border-slate-800">Demonstrativo do resultado (gerencial)</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-800/80">
              {dre.map((r) => (
                <tr key={r.label} className={r.strong ? 'bg-slate-800/40' : ''}>
                  <td className={`px-4 py-2 ${r.strong ? 'font-bold text-white' : 'text-slate-300'}`}>
                    {r.label}
                    {r.hint && <div className="text-[11px] text-slate-500 font-normal">{r.hint}</div>}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${r.strong ? 'font-bold text-white' : 'text-slate-200'}`}>
                    {r.value === null ? <span className="text-slate-500 text-xs">n/a (filtrado)</span> : brl(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.filtersApplied && (
            <p className="px-4 py-3 text-[11px] text-amber-300/80 border-t border-slate-800">
              Com filtro de mecânico, pagamento ou busca, as despesas fixas não entram no resultado (elas não pertencem a uma OS).
            </p>
          )}
        </section>

        <section className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <h2 className="px-4 py-3 font-bold text-white border-b border-slate-800">
            ISS e resultado por {GROUP_LABELS[report.period.groupBy].toLowerCase()}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-slate-400 bg-slate-950/60">
                <tr>
                  {[GROUP_LABELS[report.period.groupBy], 'OS', 'Faturado', 'Mão de obra', 'ISS', 'Lucro bruto', 'Comissões', 'Despesas', 'Resultado'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 ${i > 1 ? 'text-right' : 'text-left'} whitespace-nowrap`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 tabular-nums">
                {report.periods.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">Nenhum faturamento ou despesa no período.</td></tr>
                )}
                {report.periods.map((p) => (
                  <tr key={p.key}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-200">{p.label}</td>
                    <td className="px-3 py-2">{p.orders}</td>
                    <td className="px-3 py-2 text-right">{brl(p.totalBilled)}</td>
                    <td className="px-3 py-2 text-right">{brl(p.labor)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-200">{brl(p.iss)}</td>
                    <td className="px-3 py-2 text-right">{brl(p.grossProfit)}</td>
                    <td className="px-3 py-2 text-right">{brl(p.commission)}</td>
                    <td className="px-3 py-2 text-right">{p.expenses === null ? 'n/a' : brl(p.expenses)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{p.result === null ? 'n/a' : brl(p.result)}</td>
                  </tr>
                ))}
              </tbody>
              {report.periods.length > 0 && (
                <tfoot className="bg-slate-800/50 font-bold text-white tabular-nums">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2">{s.orders}</td>
                    <td className="px-3 py-2 text-right">{brl(s.totalBilled)}</td>
                    <td className="px-3 py-2 text-right">{brl(s.labor)}</td>
                    <td className="px-3 py-2 text-right text-amber-200">{brl(s.iss)}</td>
                    <td className="px-3 py-2 text-right">{brl(s.grossProfit)}</td>
                    <td className="px-3 py-2 text-right">{brl(s.commission)}</td>
                    <td className="px-3 py-2 text-right">{s.operationalExpenses === null ? 'n/a' : brl(s.operationalExpenses)}</td>
                    <td className="px-3 py-2 text-right">{s.result === null ? 'n/a' : brl(s.result)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>

      <p className="flex gap-2 text-xs text-slate-500">
        <Info className="w-4 h-4 shrink-0" />
        Faturamento pela data do pagamento da OS. ISS calculado só sobre a mão de obra líquida de descontos (peças: ICMS), com a alíquota
        congelada em cada OS no faturamento — regime atual: {st.taxRegimeLabel}. ISS e comissão são arredondados por OS (como em cada nota fiscal) e
        depois somados, por isso o total pode diferir em centavos da alíquota aplicada sobre o total. O ISS aparece apenas nos relatórios de gestão; nunca na página da OS do cliente.
      </p>
    </div>
  );
}

// ==========================================
// Ordens de Serviço
// ==========================================

function OrdersTab({ report, isManager, onChanged }: { report: FinancialReport; isManager: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const s = report.summary;

  async function closingPdf(id: string) {
    try {
      setBusy(id);
      const c = await fetchApi<OrderClosing>(`/financial/orders/${id}/closing`);
      await (await import('@/lib/export-pdf')).exportOrderClosingPdf(c);
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function reverse(id: string, code: number) {
    const reason = prompt(`Estornar o faturamento da OS #${code}? Ela volta para "Concluída" e a entrada no caixa é cancelada.\n\nMotivo do estorno:`);
    if (!reason?.trim()) return;
    try {
      setBusy(id);
      await fetchApi(`/work-orders/${id}/billing/reverse`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      onChanged();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const cols = ['Data', 'OS', 'Veículo / Placa (Serviço)', 'Cliente', 'Custo peça', 'Venda peça', 'Mecânico', 'Mão de obra', 'Desconto', 'Total cobrado', 'Lucro oficina', 'ISS', 'Comissão', 'Pagamento', ''];
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="uppercase text-slate-400 bg-slate-950/60">
            <tr>{cols.map((h, i) => <th key={i} className={`px-2.5 py-2.5 whitespace-nowrap ${[4, 5, 7, 8, 9, 10, 11, 12].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 tabular-nums">
            {report.orders.length === 0 && <tr><td colSpan={cols.length} className="py-8 text-center text-slate-500">Nenhuma OS faturada com esses filtros.</td></tr>}
            {report.orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-800/40">
                <td className="px-2.5 py-2 whitespace-nowrap">{brDate(o.date)}</td>
                <td className="px-2.5 py-2 font-mono font-bold text-amber-400"><Link href={`/os/${o.id}`}>#{o.code}</Link></td>
                <td className="px-2.5 py-2 min-w-56">
                  <div className="text-white">{o.vehicle} / <span className="font-mono">{o.plate}</span></div>
                  <div className="text-slate-500">{o.services}</div>
                </td>
                <td className="px-2.5 py-2">{o.client}</td>
                <td className="px-2.5 py-2 text-right">{brl(o.partsCost)}</td>
                <td className="px-2.5 py-2 text-right">{brl(o.partsSale)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{o.mechanic}</td>
                <td className="px-2.5 py-2 text-right">{brl(o.labor)}</td>
                <td className="px-2.5 py-2 text-right">{o.discount ? brl(o.discount) : '-'}</td>
                <td className="px-2.5 py-2 text-right font-semibold text-white">{brl(o.totalBilled)}</td>
                <td className="px-2.5 py-2 text-right text-emerald-300">{brl(o.grossProfit)}</td>
                <td className="px-2.5 py-2 text-right text-amber-200" title={`${o.issRate}%`}>{brl(o.iss)}</td>
                <td className="px-2.5 py-2 text-right" title={`${o.commissionRate}%`}>{brl(o.commission)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{o.payment}</td>
                <td className="px-2.5 py-2">
                  <div className="flex gap-1 justify-end">
                    <ActionBtn icon={FileText} label="Controle" disabled={busy === o.id} onClick={() => closingPdf(o.id)} />
                    {isManager && <ActionBtn icon={Undo2} label="Estornar" tone="danger" disabled={busy === o.id} onClick={() => reverse(o.id, o.code)} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {report.orders.length > 0 && (
            <tfoot className="bg-slate-800/50 font-bold text-white tabular-nums">
              <tr>
                <td className="px-2.5 py-2" colSpan={4}>Totais ({s.orders} OS)</td>
                <td className="px-2.5 py-2 text-right">{brl(s.partsCost)}</td>
                <td className="px-2.5 py-2 text-right">{brl(s.partsSale)}</td>
                <td />
                <td className="px-2.5 py-2 text-right">{brl(s.labor)}</td>
                <td className="px-2.5 py-2 text-right">{brl(s.discount)}</td>
                <td className="px-2.5 py-2 text-right">{brl(s.totalBilled)}</td>
                <td className="px-2.5 py-2 text-right">{brl(s.grossProfit)}</td>
                <td className="px-2.5 py-2 text-right">{brl(s.iss)}</td>
                <td className="px-2.5 py-2 text-right">{brl(s.commission)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// ==========================================
// Produção dos mecânicos
// ==========================================

function MechanicsTab({ report, staff, meta, onChanged }: { report: FinancialReport; staff: StaffOption[]; meta: FinancialMeta | null; onChanged: () => void }) {
  const [paying, setPaying] = useState<{ id: string; amount: number; name: string } | null>(null);

  if (report.mechanics.length === 0) return <Box>Nenhuma produção ou pagamento de comissão no período.</Box>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Comissão sobre a mão de obra líquida de descontos, com a % de cada mecânico na data do faturamento (ajuste a % em Equipe → Editar).
        &quot;Pago no período&quot; soma as despesas da categoria &quot;Pagamento de comissão&quot;.
      </p>
      {report.mechanics.map((m) => (
        <section key={m.id ?? 'none'} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
            <h2 className="font-bold text-white">{m.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm tabular-nums">
              <span className="text-slate-400">Mão de obra <b className="text-white block">{brl(m.labor)}</b></span>
              <span className="text-slate-400">Comissão {m.commissionRates.length ? `(${m.commissionRates.map(pctFmt).join(' / ')})` : ''} <b className="text-white block">{brl(m.commission)}</b></span>
              <span className="text-slate-400">Pago no período <b className="text-white block">{brl(m.paid)}</b></span>
              <span className="text-slate-400">Saldo a pagar <b className={`block ${m.balance > 0 ? 'text-amber-300' : m.balance < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{brl(m.balance)}</b></span>
            </div>
            {m.id && m.balance > 0 && (
              <button
                onClick={() => setPaying({ id: m.id!, amount: m.balance, name: m.name })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 self-start"
              >
                <Wallet className="w-3.5 h-3.5" />
                Registrar pagamento
              </button>
            )}
          </div>
          {m.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="uppercase text-slate-400 bg-slate-950/60">
                  <tr><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">OS</th><th className="px-3 py-2 text-left">Veículo / Placa</th><th className="px-3 py-2 text-left">Serviço</th><th className="px-3 py-2 text-right">Mão de obra</th><th className="px-3 py-2 text-right">Comissão</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {m.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-1.5">{brDate(it.date)}</td>
                      <td className="px-3 py-1.5 font-mono text-amber-400">#{it.code}</td>
                      <td className="px-3 py-1.5">{it.vehicle}</td>
                      <td className="px-3 py-1.5 text-slate-400">{it.services}</td>
                      <td className="px-3 py-1.5 text-right">{brl(it.labor)}</td>
                      <td className="px-3 py-1.5 text-right" title={`${it.commissionRate}%`}>{brl(it.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      {paying && (
        <ExpenseModal
          staff={staff}
          meta={meta}
          initial={{ category: 'COMISSAO_MECANICO', beneficiaryId: paying.id, amount: paying.amount, description: `Pagamento de comissão - ${paying.name}` }}
          onClose={(changed) => {
            setPaying(null);
            if (changed) onChanged();
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// Despesas
// ==========================================

function ExpensesTab({ report, staff, meta, isManager, onChanged }: { report: FinancialReport; staff: StaffOption[]; meta: FinancialMeta | null; isManager: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<ExpenseRow | null | undefined>(undefined);
  const e = report.expenses;

  async function remove(x: ExpenseRow) {
    if (!confirm(`Excluir a despesa "${x.description}" de ${brl(x.amount)}? Esta ação não pode ser desfeita.`)) return;
    try {
      await fetchApi(`/financial/expenses/${x.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          <Card label="Total de despesas" value={brl(e.total)} />
          <Card label="Pago pelo caixa" value={brl(e.paidByCash)} />
          <Card label="Pago por sócios" value={brl(e.paidByPartner)} />
          <Card label="Pagamentos de comissão" value={brl(e.commissionPayments)} hint="Quitam o saldo dos mecânicos" />
        </div>
        <button onClick={() => setEditing(null)} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg self-start">
          <Plus className="w-4 h-4" />
          Nova despesa
        </button>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-slate-400 bg-slate-950/60">
            <tr><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Descrição</th><th className="px-3 py-2 text-left">Categoria</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-left">Quem pagou</th><th className="px-3 py-2 text-left">Pagamento</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 tabular-nums">
            {e.rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma despesa lançada no período.</td></tr>}
            {e.rows.map((x) => (
              <tr key={x.id}>
                <td className="px-3 py-2 whitespace-nowrap">{brDate(x.date)}</td>
                <td className="px-3 py-2 text-white">{x.description}{x.beneficiary && <span className="text-slate-500"> • {x.beneficiary}</span>}</td>
                <td className="px-3 py-2 text-slate-300">{x.categoryLabel}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{brl(x.amount)}</td>
                <td className="px-3 py-2">{x.paidBy === 'SOCIO' ? 'Sócio' : 'Caixa da oficina'}</td>
                <td className="px-3 py-2">{x.payment}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <ActionBtn icon={Pencil} label="Editar" onClick={() => setEditing(x)} />
                    {isManager && <ActionBtn icon={Trash2} label="Excluir" tone="danger" onClick={() => remove(x)} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {e.byCategory.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white mb-2">Por categoria</h3>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
            {e.byCategory.map((c) => (
              <li key={c.key} className="flex justify-between border-b border-slate-800/60 py-1"><span className="text-slate-300">{c.label}</span><b className="tabular-nums">{brl(c.amount)}</b></li>
            ))}
          </ul>
        </section>
      )}

      {editing !== undefined && (
        <ExpenseModal
          staff={staff}
          meta={meta}
          expense={editing}
          onClose={(changed) => {
            setEditing(undefined);
            if (changed) onChanged();
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({
  expense,
  initial,
  staff,
  meta,
  onClose,
}: {
  expense?: ExpenseRow | null;
  initial?: { category: string; beneficiaryId: string; amount: number; description: string };
  staff: StaffOption[];
  meta: FinancialMeta | null;
  onClose: (changed: boolean) => void;
}) {
  const [form, setForm] = useState({
    paidAt: expense?.date ?? ymd(new Date()),
    description: expense?.description ?? initial?.description ?? '',
    category: expense?.category ?? initial?.category ?? 'INSUMOS',
    amount: expense ? String(expense.amount) : initial ? initial.amount.toFixed(2) : '',
    paymentMethod: expense?.paymentMethod ?? 'PIX',
    paidBy: expense?.paidBy ?? 'CAIXA',
    beneficiaryId: expense?.beneficiaryId ?? initial?.beneficiaryId ?? '',
    notes: expense?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isCommission = form.category === 'COMISSAO_MECANICO';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const [y, m, d] = form.paidAt.split('-').map(Number);
      await fetchApi(expense ? `/financial/expenses/${expense.id}` : '/financial/expenses', {
        method: expense ? 'PATCH' : 'POST',
        body: JSON.stringify({
          paidAt: new Date(y, m - 1, d, 12, 0, 0).toISOString(),
          description: form.description.trim(),
          category: form.category,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          paidBy: form.paidBy,
          beneficiaryId: isCommission ? form.beneficiaryId || undefined : null,
          notes: form.notes.trim() || null,
        }),
      });
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={expense ? 'Editar despesa' : 'Nova despesa'} onClose={() => onClose(false)}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data *">
            <input type="date" required value={form.paidAt} onChange={(e) => set('paidAt', e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </Field>
          <Field label="Valor (R$) *">
            <input type="number" required min="0.01" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Descrição *">
          <input required minLength={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Categoria *">
          <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
            {(meta?.expenseCategories ?? [{ key: form.category, label: form.category }]).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        {isCommission && (
          <Field label="Mecânico que recebeu *">
            <select required value={form.beneficiaryId} onChange={(e) => set('beneficiaryId', e.target.value)} className={inputCls}>
              <option value="">Selecione...</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quem pagou *">
            <select value={form.paidBy} onChange={(e) => set('paidBy', e.target.value)} className={inputCls}>
              <option value="CAIXA">Caixa da oficina</option>
              <option value="SOCIO">Sócio</option>
            </select>
          </Field>
          <Field label="Forma de pagamento *">
            <select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} className={inputCls}>
              {PAYMENT_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Observações">
          <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} />
        </Field>
        <FormError message={error} />
        <ModalActions onCancel={() => onClose(false)} saving={saving} />
      </form>
    </Modal>
  );
}

// ==========================================
// Configuração fiscal
// ==========================================

function SettingsTab({ isManager, meta, onSaved }: { isManager: boolean; meta: FinancialMeta | null; onSaved: () => void }) {
  const [settings, setSettings] = useState<FinancialSettings | null>(null);
  const [form, setForm] = useState<Partial<Record<'taxRegime' | 'issRate' | 'municipality' | 'serviceCode' | 'companyName', string>>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchApi<FinancialSettings>('/financial/settings')
      .then((s) => {
        setSettings(s);
        setForm({ taxRegime: s.taxRegime, issRate: String(s.issRate), municipality: s.municipality, serviceCode: s.serviceCode, companyName: s.companyName });
      })
      .catch((err) => setMessage({ ok: false, text: errorMessage(err) }));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const s = await fetchApi<FinancialSettings>('/financial/settings', {
        method: 'PUT',
        body: JSON.stringify({ ...form, issRate: Number(form.issRate) }),
      });
      setSettings(s);
      setMessage({ ok: true, text: 'Configuração salva. A nova alíquota vale para as próximas OS faturadas.' });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return message ? <Box>{message.text}</Box> : <Spinner />;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <form onSubmit={save} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-white">Dados fiscais da oficina</h2>
        <Field label="Nome da oficina (cabeçalho dos relatórios)">
          <input disabled={!isManager} value={form.companyName ?? ''} onChange={(e) => set('companyName', e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Município">
            <input disabled={!isManager} value={form.municipality ?? ''} onChange={(e) => set('municipality', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Item da lista de serviços (LC 116)">
            <input disabled={!isManager} value={form.serviceCode ?? ''} onChange={(e) => set('serviceCode', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Regime tributário">
            <select disabled={!isManager} value={form.taxRegime} onChange={(e) => set('taxRegime', e.target.value)} className={inputCls}>
              {(meta?.taxRegimes ?? []).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Alíquota de ISS (%)">
            <input disabled={!isManager} type="number" min={0} max={5} step="0.01" value={form.issRate ?? ''} onChange={(e) => set('issRate', e.target.value)} className={inputCls} />
          </Field>
        </div>
        {message && <div className={`text-sm rounded-lg px-3 py-2 border ${message.ok ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-300 bg-rose-500/10 border-rose-500/30'}`}>{message.text}</div>}
        {isManager ? (
          <ModalActions onCancel={() => setForm({ taxRegime: settings.taxRegime, issRate: String(settings.issRate), municipality: settings.municipality, serviceCode: settings.serviceCode, companyName: settings.companyName })} saving={saving} />
        ) : (
          <p className="text-xs text-slate-500">Somente o Administrador ou o Gerente Geral alteram a configuração fiscal.</p>
        )}
      </form>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-sm text-slate-300 leading-relaxed">
        <h2 className="font-bold text-white">Como o ISS é calculado</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>O ISS é municipal (LC 116/2003). Conserto e manutenção de veículos é o <b>item 14.01</b>; em <b>Parauapebas/PA</b> a alíquota é <b>5%</b> (Código Tributário Municipal).</li>
          <li>A base é só a <b>mão de obra</b>, líquida de descontos. Peças e partes empregadas ficam fora da base do ISS (sujeitas ao ICMS, estadual).</li>
          <li>A alíquota fica <b>congelada em cada OS</b> no momento do faturamento: mudar a configuração não altera relatórios passados.</li>
          <li><b>Simples Nacional:</b> o ISS é pago dentro do DAS, numa fração da alíquota efetiva. Se quiser o valor exato pago, informe aqui a parcela de ISS da sua alíquota efetiva (seu contador informa). <b>MEI:</b> o ISS é fixo no DAS-MEI — use 0%.</li>
          <li>Reforma tributária (EC 132/2023): o ISS continua integral até 2028 e é reduzido gradualmente de 2029 a 2032, quando é substituído pelo IBS.</li>
          <li>O ISS aparece somente nos relatórios de gestão. A página da OS enviada ao cliente nunca mostra ISS, custos nem comissões.</li>
        </ul>
        <p className="text-xs text-slate-500">Valores gerenciais estimados. A apuração oficial é a da nota fiscal de serviço (NFS-e) e do seu contador.</p>
      </section>
    </div>
  );
}
