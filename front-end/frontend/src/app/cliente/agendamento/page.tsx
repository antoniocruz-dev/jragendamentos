'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, Car, Clock, Plus } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { toast } from '@/components/feedback';
import { AreaTitle } from '@/components/layout/AreaShell';
import { Badge, Button, Card, EmptyState, InlineError, Input, LightSkeleton, Modal, TextArea, fieldCls } from '@/components/ui';
import { brDate } from '@/lib/os-status';
import { cn } from '@/lib/cn';

interface Vehicle {
  id: string;
  licensePlate: string;
  brand: string;
  model: string;
  year: number;
}
interface Slot {
  time: string;
  at: string;
  available: boolean;
}
interface SlotsResponse {
  date: string;
  closedReason: string | null;
  slots: Slot[];
}
interface Appointment {
  id: string;
  scheduledFor: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ATTENDED';
  serviceType: string | null;
  vehicle: { licensePlate: string; model: string };
}

const SERVICES = ['Revisão', 'Troca de óleo', 'Freios', 'Suspensão', 'Elétrica', 'Diagnóstico'];
const STATUS_LABEL: Record<Appointment['status'], string> = {
  PENDING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  ATTENDED: 'Atendido',
};
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Hoje no fuso da oficina, AAAA-MM-DD */
function todayISO() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}
/** Próximo dia útil (seg–sex) a partir de amanhã */
function nextBusinessDay() {
  const d = new Date(Date.now() - 3 * 3600_000 + 86400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Agendamento pelo cliente: adapta a tela de Agendamentos da equipe ao Design System Mobile First.
 * Mesmas regras da API: segunda a sexta, 08:00–18:00, 1 hora por atendimento, um veículo por horário.
 */
export default function ClienteAgendamento() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [otherService, setOtherService] = useState('');
  const [date, setDate] = useState(nextBusinessDay);
  const [slots, setSlots] = useState<SlotsResponse | null>(null);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [now] = useState(() => Date.now());

  const loadBase = useCallback(() => {
    fetchApi<Vehicle[]>('/cliente/vehicles')
      .then((v) => {
        setVehicles(v);
        setVehicleId((cur) => cur || v[0]?.id || '');
      })
      .catch((err) => setError(errorMessage(err)));
    fetchApi<Appointment[]>('/cliente/appointments')
      .then(setAppointments)
      .catch(() => setAppointments([]));
  }, []);

  useEffect(loadBase, [loadBase]);

  // Horários livres do dia escolhido
  useEffect(() => {
    if (!date) return;
    const ctrl = new AbortController();
    fetchApi<SlotsResponse>(`/cliente/slots?date=${date}`, { signal: ctrl.signal })
      .then(setSlots)
      .catch((err) => !ctrl.signal.aborted && setSlots({ date, closedReason: errorMessage(err), slots: [] }));
    return () => ctrl.abort();
  }, [date]);

  const service = serviceType === 'Outro' ? otherService.trim() : serviceType;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vehicleId) return setError('Escolha o veículo.');
    if (service.length < 3) return setError('Escolha ou descreva o serviço desejado.');
    if (!time) return setError('Escolha um horário disponível.');
    setSubmitting(true);
    try {
      await fetchApi('/cliente/appointments', {
        method: 'POST',
        body: JSON.stringify({ vehicleId, date, time, serviceType: service, notes: notes.trim() || undefined }),
        successToast: 'Agendamento enviado! A oficina vai confirmar.',
        errorToast: false,
      });
      setNotes('');
      setTime('');
      loadBase();
      // Recarrega os horários (o escolhido agora está ocupado)
      const fresh = await fetchApi<SlotsResponse>(`/cliente/slots?date=${date}`);
      setSlots(fresh);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(a: Appointment) {
    if (!confirm(`Desmarcar o agendamento de ${brDate(a.scheduledFor, true)}?`)) return;
    try {
      await fetchApi(`/cliente/appointments/${a.id}/cancel`, { method: 'PATCH', successToast: 'Agendamento desmarcado.' });
      loadBase();
    } catch {
      // erro já exibido
    }
  }

  const upcoming = appointments.filter((a) => ['PENDING', 'CONFIRMED'].includes(a.status) && new Date(a.scheduledFor).getTime() > now);

  return (
    <>
      <AreaTitle title="Agendar serviço" subtitle="Segunda a sexta, das 08:00 às 18:00" />

      {!vehicles ? (
        <LightSkeleton rows={2} />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Card>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-extrabold">1. Veículo</h2>
              <Button variant="ghost" onClick={() => setAddingVehicle(true)} icon={<Plus className="w-4 h-4" aria-hidden />}>
                Novo veículo
              </Button>
            </div>
            {vehicles.length === 0 ? (
              <EmptyState icon={<Car className="w-6 h-6" aria-hidden />} title="Cadastre seu veículo" text="Toque em “Novo veículo” para continuar." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Veículo">
                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={vehicleId === v.id}
                    onClick={() => setVehicleId(v.id)}
                    className={cn(
                      'min-h-14 text-left rounded-xl border px-3 py-2 transition-all duration-200 active:scale-[0.98]',
                      vehicleId === v.id ? 'border-brand-brown bg-neon-muted ring-2 ring-neon-primary' : 'border-brand-brown-light/40 hover:border-brand-brown',
                    )}
                  >
                    <span className="block font-mono font-bold">{v.licensePlate}</span>
                    <span className="block text-xs text-brand-brown-light">
                      {v.brand} {v.model} {v.year}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-extrabold mb-3">2. Serviço</h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Serviço">
              {[...SERVICES, 'Outro'].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={serviceType === s}
                  onClick={() => setServiceType(s)}
                  className={cn(
                    'min-h-11 px-4 rounded-full border text-sm font-semibold transition-all duration-200 active:scale-95',
                    serviceType === s ? 'bg-brand-brown text-white border-brand-brown' : 'border-brand-brown-light/50 text-brand-brown hover:border-brand-brown',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            {serviceType === 'Outro' && (
              <div className="mt-3">
                <Input label="Descreva o serviço" maxLength={255} value={otherService} onChange={(e) => setOtherService(e.target.value)} />
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-extrabold mb-3">3. Data e horário</h2>
            <label htmlFor="ag-date" className="block text-sm font-semibold mb-1.5">
              Data
            </label>
            <input id="ag-date" type="date" min={todayISO()} value={date} onChange={(e) => {
                setDate(e.target.value);
                setSlots(null);
                setTime('');
              }} className={fieldCls} />
            <div className="mt-4">
              {!slots ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" aria-label="Carregando horários" role="status">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="h-11 rounded-xl bg-brand-brown-light/10 animate-pulse" />
                  ))}
                </div>
              ) : slots.closedReason ? (
                <p className="text-sm text-brand-brown-light flex items-start gap-2">
                  <CalendarX className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  {slots.closedReason}
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="radiogroup" aria-label="Horário">
                  {slots.slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      role="radio"
                      aria-checked={time === s.time}
                      disabled={!s.available}
                      onClick={() => setTime(s.time)}
                      className={cn(
                        'min-h-11 rounded-xl border text-sm font-bold transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:line-through disabled:cursor-not-allowed',
                        time === s.time
                          ? 'bg-neon-primary text-brand-brown-dark border-neon-deep shadow-[0_0_12px_rgba(57,255,20,0.45)]'
                          : 'border-brand-brown-light/40 hover:border-brand-brown',
                      )}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <TextArea label="Observações (opcional)" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: barulho ao frear" />
          </Card>

          <InlineError message={error} />
          <Button type="submit" block loading={submitting} icon={<CalendarCheck className="w-5 h-5" aria-hidden />} className="min-h-12">
            Confirmar agendamento
          </Button>
        </form>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="font-extrabold mb-3">Meus agendamentos</h2>
          <ul className="space-y-2">
            {upcoming.map((a, i) => (
              <Card as="li" key={a.id} accent={a.status === 'CONFIRMED' ? 'deep' : 'neon'} delay={i * 40}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold flex items-center gap-1.5">
                      <Clock className="w-4 h-4" aria-hidden />
                      {brDate(a.scheduledFor, true)}
                    </p>
                    <p className="text-sm text-brand-brown-light">
                      {a.vehicle.licensePlate} {a.vehicle.model}
                      {a.serviceType ? ` · ${a.serviceType}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={a.status === 'CONFIRMED' ? 'deep' : 'muted'}>{STATUS_LABEL[a.status]}</Badge>
                    <Button variant="ghost" onClick={() => cancel(a)}>
                      Desmarcar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {addingVehicle && (
        <NewVehicleModal
          onClose={(v) => {
            setAddingVehicle(false);
            if (v) {
              setVehicles((list) => [...(list ?? []), v]);
              setVehicleId(v.id);
              toast.success('Veículo cadastrado.');
            }
          }}
        />
      )}
    </>
  );
}

function NewVehicleModal({ onClose }: { onClose: (v?: Vehicle) => void }) {
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const v = await fetchApi<Vehicle>('/cliente/vehicles', {
        method: 'POST',
        body: JSON.stringify({ licensePlate: plate, brand, model, year: Number(year) }),
        successToast: false,
        errorToast: false,
      });
      onClose(v);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title="Novo veículo" onClose={() => onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Placa" required maxLength={8} placeholder="ABC1D23" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} className="font-mono uppercase" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Marca" required value={brand} onChange={(e) => setBrand(e.target.value)} />
          <Input label="Modelo" required value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <Input label="Ano" required inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
        <InlineError message={error} />
        <Button type="submit" block loading={saving}>
          Salvar veículo
        </Button>
      </form>
    </Modal>
  );
}
