'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CalendarPlus, Car, ClipboardList } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { AreaTitle } from '@/components/layout/AreaShell';
import { Badge, ButtonLink, Card, CardLink, EmptyState, LightError, LightSkeleton, StatusProgress } from '@/components/ui';
import { STATUS_INFO, brDate, isPendingBudget, type BudgetStatus, type WorkOrderStatus } from '@/lib/os-status';

interface OsRow {
  id: string;
  code: number;
  status: WorkOrderStatus;
  budgetStatus: BudgetStatus;
  createdAt: string;
  finishedAt: string | null;
  reportedIssue: string | null;
  vehicle: { licensePlate: string; brand: string; model: string };
}

interface AppointmentRow {
  id: string;
  scheduledFor: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ATTENDED';
  serviceType: string | null;
  vehicle: { licensePlate: string; model: string };
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function ClienteHome() {
  const [orders, setOrders] = useState<OsRow[] | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback((signal?: AbortSignal) => {
    Promise.all([
      fetchApi<OsRow[]>('/cliente/os', { signal }),
      fetchApi<AppointmentRow[]>('/cliente/appointments', { signal }).catch(() => []),
    ])
      .then(([os, appts]) => {
        setError(null);
        setOrders(os);
        setAppointments(appts);
      })
      .catch((err) => !signal?.aborted && setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const pending = orders?.filter(isPendingBudget) ?? [];
  const upcoming = appointments.filter((a) => ['PENDING', 'CONFIRMED'].includes(a.status) && new Date(a.scheduledFor).getTime() > now);

  return (
    <>
      <AreaTitle
        title="Minhas O.S"
        subtitle={pending.length ? `${pending.length} orçamento(s) aguardando sua aprovação` : 'Acompanhe os serviços do seu veículo'}
        action={
          <ButtonLink href="/cliente/agendamento" icon={<CalendarPlus className="w-4 h-4" aria-hidden />} className="hidden sm:inline-flex">
            Agendar serviço
          </ButtonLink>
        }
      />

      {upcoming.length > 0 && (
        <Card accent="neon" className="mb-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="w-5 h-5 text-neon-deep shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 text-sm">
              <p className="font-bold">Próximo agendamento</p>
              <p className="text-brand-brown-light">
                {brDate(upcoming[upcoming.length - 1].scheduledFor, true)} · {upcoming[upcoming.length - 1].vehicle.licensePlate}
                {upcoming[upcoming.length - 1].serviceType ? ` · ${upcoming[upcoming.length - 1].serviceType}` : ''}
              </p>
            </div>
          </div>
        </Card>
      )}

      {error && !orders ? (
        <LightError message={error} onRetry={() => load()} />
      ) : !orders ? (
        <LightSkeleton rows={3} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-6 h-6" aria-hidden />}
          title="Nenhuma O.S por aqui ainda"
          text="Quando a oficina abrir uma Ordem de Serviço para o seu veículo, ela aparece nesta tela."
          action={
            <ButtonLink href="/cliente/agendamento" icon={<CalendarPlus className="w-4 h-4" aria-hidden />}>
              Agendar serviço
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orders.map((o, i) => {
            const info = STATUS_INFO[o.status] ?? STATUS_INFO.DRAFT;
            const pendingBudget = isPendingBudget(o);
            return (
              <li key={o.id}>
                <CardLink href={`/cliente/os/${o.id}`} accent={info.accent} delay={Math.min(i, 8) * 40}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-mono text-lg font-extrabold">O.S #{o.code}</p>
                      <p className="text-sm text-brand-brown-light flex items-center gap-1.5 truncate">
                        <Car className="w-4 h-4 shrink-0" aria-hidden />
                        {o.vehicle.brand} {o.vehicle.model} · {o.vehicle.licensePlate}
                      </p>
                    </div>
                    {pendingBudget ? (
                      <Badge tone="neon" pulse>
                        Orçamento pendente
                      </Badge>
                    ) : (
                      <Badge tone={o.status === 'CANCELLED' ? 'danger' : info.step >= 5 ? 'deep' : 'muted'}>{info.label}</Badge>
                    )}
                  </div>
                  <div className="mt-3">
                    <StatusProgress status={o.status} />
                  </div>
                  <p className="mt-2 text-xs text-brand-brown-light">Aberta em {brDate(o.createdAt)}</p>
                </CardLink>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
