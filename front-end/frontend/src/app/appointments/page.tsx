'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Share2,
  Pencil,

  X,
  Trash2,
} from 'lucide-react';
import { fetchApi } from '@/services/api';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { useAuth } from '@/services/auth';
import { canManageRecords } from '@/services/permissions';
import { useSearchParams } from 'next/navigation';

type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ATTENDED';

interface Appointment {
  id: string;
  scheduledFor: string;
  status: AppointmentStatus;
  notes?: string | null;
  client: { id: string; name: string; phone: string };
  vehicle: { id: string; licensePlate: string; brand: string; model: string; year: number };
}

interface ClientOption {
  id: string;
  name: string;
  phone: string;
  vehicles: { id: string; licensePlate: string; brand: string; model: string; year: number }[];
}

const STATUS_CONFIG: Record<'ALL' | AppointmentStatus, { label: string; bg: string; text: string; border: string }> = {
  ALL: { label: 'Todos', bg: 'bg-surface-muted', text: 'text-brand-graphite', border: 'border-line' },
  PENDING: { label: 'Pendente', bg: 'bg-neon-primary/10', text: 'text-brand-graphite', border: 'border-neon-deep/30' },
  CONFIRMED: { label: 'Confirmado', bg: 'bg-sky-500/10', text: 'text-sky-700', border: 'border-sky-500/30' },
  ATTENDED: { label: 'Compareceu', bg: 'bg-emerald-500/10', text: 'text-emerald-700', border: 'border-emerald-500/30' },
  CANCELLED: { label: 'Cancelado', bg: 'bg-rose-500/10', text: 'text-rose-700', border: 'border-rose-500/30' },
};

// ==========================================
// Helpers de data (semana de segunda a domingo, horário local)
// ==========================================

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - day);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Converte Date para o formato aceito por <input type="datetime-local"> no fuso local. */
function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Próximo dia útil às 08:00 (a API também recusa feriados e horários ocupados). */
function defaultSlot() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return toDatetimeLocal(d);
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

const timeFmt =new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' });
const rangeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

const noopSubscribe = () => () => {};

function parseDateParam(value: string | null): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export default function AppointmentsPage() {
  // A data atual só é lida no navegador: no Next 16, `new Date()` durante o prerender é proibido
  // e o fuso do servidor pode diferir do fuso do usuário.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [selectedWeekMs, setSelectedWeekMs] = useState<number | null>(null);
  // ?date=AAAA-MM-DD (vindo do Dashboard) abre a agenda na semana dessa data
  const dateParam = useSearchParams().get('date');
  const weekStartMs = selectedWeekMs ?? (isClient ? startOfWeek(parseDateParam(dateParam) ?? new Date()).getTime() : null);

  if (weekStartMs === null) {
    return <LoadingState />;
  }

  return <AppointmentsAgenda weekStartMs={weekStartMs} onChangeWeek={setSelectedWeekMs} />;
}

function LoadingState() {
  return <ListSkeleton rows={4} label="Carregando agenda..." />;
}

function AppointmentsAgenda({
  weekStartMs,
  onChangeWeek,
}: {
  weekStartMs: number;
  onChangeWeek: (ms: number) => void;
}) {
  const weekStart = useMemo(() => new Date(weekStartMs), [weekStartMs]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ?status=PENDING (vindo do Dashboard) pré-seleciona o filtro
  const statusParam = useSearchParams().get('status');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentStatus>(() => {
    const s = statusParam;
    return s && s in STATUS_CONFIG ? (s as AppointmentStatus) : 'ALL';
  });
  const isManager = canManageRecords(useAuth().user);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modal (criar / reagendar)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
    });

    fetchApi<Appointment[]>(`/appointments?${params}`)
      .then((data) => {
        if (cancelled) return;
        setAppointments(data);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [weekStart, weekEnd, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  function goToWeek(date: Date) {
    const next = startOfWeek(date);
    if (next.getTime() === weekStartMs) return;
    setLoading(true);
    onChangeWeek(next.getTime());
  }

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) continue;
      const key = dayKey(new Date(a.scheduledFor));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [appointments, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: appointments.length };
    for (const a of appointments) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [appointments]);

  const todayKey = dayKey(new Date());

  async function changeStatus(a: Appointment, status: AppointmentStatus) {
    let reason: string | undefined;
    if (status === 'CANCELLED') {
      const input = prompt('Motivo do cancelamento (opcional):');
      if (input === null) return;
      reason = input || undefined;
    } else if (status === 'ATTENDED') {
      if (!confirm(`Confirmar que ${a.client.name} compareceu com o veículo ${a.vehicle.licensePlate}?`)) return;
    }

    try {
      setActionLoadingId(a.id);
      await fetchApi(`/appointments/${a.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      });
      reload();
    } catch (err) {
      // o aviso de erro já é mostrado pelo fetchApi (toast)
      void err;
    } finally {
      setActionLoadingId(null);
    }
  }

  async function removeAppointment(a: Appointment) {
    if (!confirm(`Excluir definitivamente o agendamento de ${a.client.name} (${a.vehicle.licensePlate})? Para desmarcar, prefira Cancelar.`)) return;
    try {
      setActionLoadingId(a.id);
      await fetchApi(`/appointments/${a.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      // o aviso de erro já é mostrado pelo fetchApi (toast)
      void err;
    } finally {
      setActionLoadingId(null);
    }
  }

  function sendWhatsApp(a: Appointment) {
    const cleanPhone = a.client.phone.replace(/\D/g, '');
    const phoneWithDDI = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const when = fullFmt.format(new Date(a.scheduledFor));

    const message = encodeURIComponent(
      `Olá, *${a.client.name}*!\n\n` +
        `Aqui é da oficina *JR Agendamentos*.\n` +
        `Lembrete do seu agendamento para o veículo *${a.vehicle.brand} ${a.vehicle.model} (${a.vehicle.licensePlate})*:\n` +
        `📅 *${when}*\n\n` +
        `Por favor, responda *SIM* para confirmar ou nos avise caso precise reagendar.`,
    );

    const waHost = ['https://', 'wa', '.me/'].join('');
    window.open(`${waHost}${phoneWithDDI}?text=${message}`, '_blank');
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(a: Appointment) {
    setEditing(a);
    setModalOpen(true);
  }

  return (
    <div className="min-h-full bg-surface-offwhite text-brand-ink px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 border-b border-line-soft pb-4 sm:pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-ink flex items-center gap-2.5">
              <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-neon-deep shrink-0" />
              Agendamentos
            </h1>
            <p className="text-xs sm:text-sm text-brand-graphite mt-1">
              Reserve horários, confirme presença pelo WhatsApp e acompanhe a agenda da semana.
            </p>
          </div>

          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 bg-neon-primary hover:bg-neon-deep text-brand-ink font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-neon-primary/20 text-sm"
          >
            <PlusCircle className="w-5 h-5" />
            Novo Agendamento
          </button>
        </div>

        {/* Navegação da semana + filtros */}
        <div className="bg-surface-white border border-line-soft rounded-2xl p-3 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToWeek(addDays(weekStart, -7))}
              className="p-2 rounded-xl bg-surface-muted hover:bg-surface-strong text-brand-graphite"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToWeek(new Date())}
              className="px-3 py-2 rounded-xl bg-surface-muted hover:bg-surface-strong text-xs font-semibold text-brand-graphite"
            >
              Hoje
            </button>
            <button
              onClick={() => goToWeek(addDays(weekStart, 7))}
              className="p-2 rounded-xl bg-surface-muted hover:bg-surface-strong text-brand-graphite"
              title="Próxima semana"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="ml-2 text-sm font-semibold text-brand-ink whitespace-nowrap">
              {rangeFmt.format(weekStart)} – {rangeFmt.format(addDays(weekStart, 6))}
            </span>
          </div>

          <div className="flex items-center gap-1.5 scroll-x w-full lg:w-auto pb-1 lg:pb-0">
            {(Object.keys(STATUS_CONFIG) as Array<'ALL' | AppointmentStatus>).map((key) => {
              const isSelected = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 min-h-9 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-neon-primary text-brand-ink border-neon-deep shadow-sm'
                      : 'bg-surface-muted/80 text-brand-graphite border-line/60 hover:bg-surface-strong'
                  }`}
                >
                  {STATUS_CONFIG[key].label}
                  <span className="ml-1.5 opacity-70">{counts[key] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Agenda */}
        {error ? (
          <ErrorState message={`Não foi possível carregar os agendamentos: ${error}`} onRetry={reload} />
        ) : loading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {days.map((day) => {
              const key = dayKey(day);
              const items = byDay.get(key) || [];
              const isToday = key === todayKey;

              return (
                <section
                  key={key}
                  className={`bg-surface-white border rounded-2xl overflow-hidden ${
                    isToday ? 'border-neon-deep/50' : 'border-line-soft'
                  }`}
                >
                  <header className="px-4 sm:px-5 py-3 bg-surface-offwhite/60 border-b border-line-soft flex items-center justify-between">
                    <h2 className="text-sm font-bold capitalize text-brand-ink">
                      {dayFmt.format(day)}
                      {isToday && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider bg-neon-primary text-brand-ink px-2 py-0.5 rounded-full">
                          Hoje
                        </span>
                      )}
                    </h2>
                    <span className="text-xs text-brand-steel">
                      {items.length} {items.length === 1 ? 'agendamento' : 'agendamentos'}
                    </span>
                  </header>

                  {items.length === 0 ? (
                    <p className="px-4 sm:px-5 py-4 text-xs text-brand-steel">Nenhum horário reservado.</p>
                  ) : (
                    <ul className="divide-y divide-line-soft/80">
                      {items.map((a) => {
                        const st = STATUS_CONFIG[a.status];
                        const busy = actionLoadingId === a.id;
                        const isActive = a.status === 'PENDING' || a.status === 'CONFIRMED';

                        return (
                          <li
                            key={a.id}
                            className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-2.5 sm:gap-3 hover:bg-surface-muted/30"
                          >
                            <div className="flex items-center gap-2 w-24 shrink-0 font-mono font-bold text-brand-graphite">
                              <Clock className="w-4 h-4" />
                              {timeFmt.format(new Date(a.scheduledFor))}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-brand-ink uppercase tracking-wide">
                                  {a.vehicle.licensePlate}
                                </span>
                                <span className="text-xs text-brand-graphite">
                                  {a.vehicle.brand} {a.vehicle.model} ({a.vehicle.year})
                                </span>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${st.bg} ${st.text} ${st.border}`}
                                >
                                  {st.label}
                                </span>
                              </div>
                              <div className="text-sm text-brand-graphite mt-0.5">
                                {a.client.name} <span className="text-xs text-brand-steel">· {a.client.phone}</span>
                              </div>
                              {a.notes && (
                                <p className="text-xs text-brand-steel mt-1 whitespace-pre-line">{a.notes}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {a.status === 'PENDING' && (
                                <ActionButton
                                  onClick={() => changeStatus(a, 'CONFIRMED')}
                                  disabled={busy}
                                  color="sky"
                                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                                  label="Confirmar"
                                />
                              )}
                              {a.status === 'CONFIRMED' && (
                                <ActionButton
                                  onClick={() => changeStatus(a, 'ATTENDED')}
                                  disabled={busy}
                                  color="emerald"
                                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                                  label="Compareceu"
                                />
                              )}
                              {isActive && (
                                <>
                                  <ActionButton
                                    onClick={() => sendWhatsApp(a)}
                                    disabled={busy}
                                    color="emerald"
                                    icon={<Share2 className="w-3.5 h-3.5" />}
                                    label="Lembrete"
                                  />
                                  <ActionButton
                                    onClick={() => openEdit(a)}
                                    disabled={busy}
                                    color="slate"
                                    icon={<Pencil className="w-3.5 h-3.5" />}
                                    label="Reagendar"
                                  />
                                  <ActionButton
                                    onClick={() => changeStatus(a, 'CANCELLED')}
                                    disabled={busy}
                                    color="rose"
                                    icon={<XCircle className="w-3.5 h-3.5" />}
                                    label="Cancelar"
                                  />
                                </>
                              )}
                              {isManager && (
                                <ActionButton
                                  onClick={() => removeAppointment(a)}
                                  disabled={busy}
                                  color="rose"
                                  icon={<Trash2 className="w-3.5 h-3.5" />}
                                  label="Excluir"
                                />
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <AppointmentModal
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={(saved) => {
            setModalOpen(false);
            // Leva a agenda para a semana do agendamento salvo
            const savedWeek = startOfWeek(new Date(saved.scheduledFor));
            if (savedWeek.getTime() !== weekStart.getTime()) goToWeek(savedWeek);
            else reload();
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// Componentes auxiliares
// ==========================================

const ACTION_COLORS = {
  sky: 'bg-sky-600/20 hover:bg-sky-600/30 text-sky-700 border-sky-500/30',
  emerald: 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-700 border-emerald-500/30',
  rose: 'bg-rose-600/10 hover:bg-rose-600/20 text-rose-700 border-rose-500/30',
  slate: 'bg-surface-muted hover:bg-surface-strong text-brand-graphite border-line',
};

function ActionButton({
  onClick,
  disabled,
  color,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  color: keyof typeof ACTION_COLORS;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 border px-3 min-h-9 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${ACTION_COLORS[color]}`}
    >
      {icon}
      {label}
    </button>
  );
}

function AppointmentModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Appointment | null;
  onClose: () => void;
  onSaved: (a: Appointment) => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState(editing?.client.id ?? '');
  const [vehicleId, setVehicleId] = useState(editing?.vehicle.id ?? '');
  const [scheduledFor, setScheduledFor] = useState(
    editing ? toDatetimeLocal(new Date(editing.scheduledFor)) : defaultSlot(),
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return; // No reagendamento cliente/veículo são fixos
    fetchApi<ClientOption[]>('/clients/options')
      .then(setClients)
      .catch((err) => setError(`Erro ao carregar clientes: ${errorMessage(err)}`));
  }, [editing]);

  const selectedClient = clients.find((c) => c.id === clientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime())) {
      setError('Informe uma data e hora válidas.');
      return;
    }

    try {
      setSaving(true);
      const body = editing
        ? { scheduledFor: when.toISOString(), notes }
        : { clientId, vehicleId, scheduledFor: when.toISOString(), notes: notes || undefined };

      const saved = await fetchApi<Appointment>(editing ? `/appointments/${editing.id}` : '/appointments', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full bg-surface-offwhite border border-line/80 rounded-xl px-3 py-2.5 text-sm text-brand-ink placeholder-brand-steel focus:outline-none focus:border-neon-deep disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-surface-white border border-line-soft rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        <div className="sticky top-0 z-10 bg-surface-white flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-line-soft">
          <h3 className="text-lg font-bold text-brand-ink">
            {editing ? 'Reagendar' : 'Novo Agendamento'}
          </h3>
          <button type="button" onClick={onClose} className="text-brand-graphite hover:text-brand-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          {editing ? (
            <div className="text-sm text-brand-graphite bg-surface-offwhite/60 border border-line-soft rounded-xl p-3">
              <div className="font-semibold text-brand-ink">{editing.client.name}</div>
              <div className="text-xs text-brand-graphite">
                {editing.vehicle.licensePlate} · {editing.vehicle.brand} {editing.vehicle.model}
              </div>
              <p className="text-[11px] text-brand-graphite/80 mt-2">
                Ao mudar o horário, o agendamento volta para &quot;Pendente&quot; até nova confirmação.
              </p>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-brand-graphite">Cliente</span>
                <select
                  required
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    const c = clients.find((x) => x.id === e.target.value);
                    setVehicleId(c?.vehicles.length === 1 ? c.vehicles[0].id : '');
                  }}
                  className={`${inputCls} mt-1`}
                >
                  <option value="">Selecione o cliente...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.phone}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-brand-graphite">Veículo</span>
                <select
                  required
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  disabled={!selectedClient}
                  className={`${inputCls} mt-1`}
                >
                  <option value="">
                    {selectedClient && selectedClient.vehicles.length === 0
                      ? 'Cliente sem veículos cadastrados'
                      : 'Selecione o veículo...'}
                  </option>
                  {selectedClient?.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.licensePlate} — {v.brand} {v.model} ({v.year})
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-brand-graphite">Data e hora</span>
            <input
              type="datetime-local"
              required
              value={scheduledFor}
              min={toDatetimeLocal(new Date())}
              onChange={(e) => setScheduledFor(e.target.value)}
              step={1800}
              className={`${inputCls} mt-1 [color-scheme:light]`}
            />
            <span className="block mt-1 text-[11px] text-brand-steel">
              Segunda a sexta, das 08:00 às 17:00 (cada atendimento ocupa 1 hora). Um veículo por horário; feriados nacionais bloqueados.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-brand-graphite">Observações</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: revisão dos 30 mil km, barulho na suspensão..."
              className={`${inputCls} mt-1 resize-none`}
            />
          </label>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-surface-white flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-line-soft">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-surface-muted hover:bg-surface-strong text-sm font-semibold text-brand-graphite"
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-neon-primary hover:bg-neon-deep text-brand-ink text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : editing ? 'Salvar novo horário' : 'Agendar'}
          </button>
        </div>
      </form>
    </div>
  );
}
