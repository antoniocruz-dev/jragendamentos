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
  Wrench,
  X,
  Trash2,
} from 'lucide-react';
import { fetchApi } from '@/services/api';
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
  ALL: { label: 'Todos', bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' },
  PENDING: { label: 'Pendente', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  CONFIRMED: { label: 'Confirmado', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  ATTENDED: { label: 'Compareceu', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  CANCELLED: { label: 'Cancelado', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
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

function defaultSlot() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
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
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center text-slate-400 flex flex-col items-center gap-3">
      <Wrench className="w-8 h-8 text-amber-500 animate-spin" />
      <span>Carregando agenda...</span>
    </div>
  );
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
      alert(`Erro ao atualizar status: ${errorMessage(err)}`);
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
      alert(`Erro ao excluir: ${errorMessage(err)}`);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
              <Calendar className="w-8 h-8 text-amber-500" />
              Agendamentos
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Reserve horários, confirme presença pelo WhatsApp e acompanhe a agenda da semana.
            </p>
          </div>

          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-amber-500/20 text-sm"
          >
            <PlusCircle className="w-5 h-5" />
            Novo Agendamento
          </button>
        </div>

        {/* Navegação da semana + filtros */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToWeek(addDays(weekStart, -7))}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToWeek(new Date())}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
            >
              Hoje
            </button>
            <button
              onClick={() => goToWeek(addDays(weekStart, 7))}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Próxima semana"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="ml-2 text-sm font-semibold text-white whitespace-nowrap">
              {rangeFmt.format(weekStart)} – {rangeFmt.format(addDays(weekStart, 6))}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0">
            {(Object.keys(STATUS_CONFIG) as Array<'ALL' | AppointmentStatus>).map((key) => {
              const isSelected = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700'
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
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl p-6 text-sm">
            Não foi possível carregar os agendamentos: {error}
          </div>
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
                  className={`bg-slate-900 border rounded-2xl overflow-hidden ${
                    isToday ? 'border-amber-500/50' : 'border-slate-800'
                  }`}
                >
                  <header className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-sm font-bold capitalize text-white">
                      {dayFmt.format(day)}
                      {isToday && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">
                          Hoje
                        </span>
                      )}
                    </h2>
                    <span className="text-xs text-slate-500">
                      {items.length} {items.length === 1 ? 'agendamento' : 'agendamentos'}
                    </span>
                  </header>

                  {items.length === 0 ? (
                    <p className="px-5 py-4 text-xs text-slate-500">Nenhum horário reservado.</p>
                  ) : (
                    <ul className="divide-y divide-slate-800/80">
                      {items.map((a) => {
                        const st = STATUS_CONFIG[a.status];
                        const busy = actionLoadingId === a.id;
                        const isActive = a.status === 'PENDING' || a.status === 'CONFIRMED';

                        return (
                          <li
                            key={a.id}
                            className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3 hover:bg-slate-800/30"
                          >
                            <div className="flex items-center gap-2 w-24 shrink-0 font-mono font-bold text-amber-400">
                              <Clock className="w-4 h-4" />
                              {timeFmt.format(new Date(a.scheduledFor))}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white uppercase tracking-wide">
                                  {a.vehicle.licensePlate}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {a.vehicle.brand} {a.vehicle.model} ({a.vehicle.year})
                                </span>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${st.bg} ${st.text} ${st.border}`}
                                >
                                  {st.label}
                                </span>
                              </div>
                              <div className="text-sm text-slate-300 mt-0.5">
                                {a.client.name} <span className="text-xs text-slate-500">· {a.client.phone}</span>
                              </div>
                              {a.notes && (
                                <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{a.notes}</p>
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
  sky: 'bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border-sky-500/30',
  emerald: 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30',
  rose: 'bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border-rose-500/30',
  slate: 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700',
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
      className={`inline-flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${ACTION_COLORS[color]}`}
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
    fetchApi<ClientOption[]>('/clients')
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
    'w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">
            {editing ? 'Reagendar' : 'Novo Agendamento'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {editing ? (
            <div className="text-sm text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <div className="font-semibold text-white">{editing.client.name}</div>
              <div className="text-xs text-slate-400">
                {editing.vehicle.licensePlate} · {editing.vehicle.brand} {editing.vehicle.model}
              </div>
              <p className="text-[11px] text-amber-400/80 mt-2">
                Ao mudar o horário, o agendamento volta para &quot;Pendente&quot; até nova confirmação.
              </p>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">Cliente</span>
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
                <span className="text-xs font-semibold text-slate-400">Veículo</span>
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
            <span className="text-xs font-semibold text-slate-400">Data e hora</span>
            <input
              type="datetime-local"
              required
              value={scheduledFor}
              min={toDatetimeLocal(new Date())}
              onChange={(e) => setScheduledFor(e.target.value)}
              className={`${inputCls} mt-1 [color-scheme:dark]`}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-400">Observações</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: revisão dos 30 mil km, barulho na suspensão..."
              className={`${inputCls} mt-1 resize-none`}
            />
          </label>

          {error && (
            <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-300"
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : editing ? 'Salvar novo horário' : 'Agendar'}
          </button>
        </div>
      </form>
    </div>
  );
}
