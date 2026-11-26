'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Car, History, Lock, MessageSquarePlus, Package, RotateCcw, Wrench } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { Badge, Button, Card, InlineError, LightError, LightSkeleton, Modal, StatusProgress, TextArea } from '@/components/ui';
import { MECHANIC_ACTION, MECHANIC_LABEL, STATUS_INFO, brDate, type MechanicStatus, type WorkOrderStatus } from '@/lib/os-status';

interface Observation {
  id: string;
  authorName: string;
  authorRole: 'CLIENTE' | 'MECANICO' | 'GESTOR' | 'ADMIN';
  type: 'ORCAMENTO_CLIENTE' | 'TECNICA_MECANICO' | 'REABERTURA';
  message: string;
  createdAt: string;
}
/** Detalhe técnico: a API não envia valores, custos nem descontos. */
interface MechanicOs {
  id: string;
  code: number;
  status: WorkOrderStatus;
  mechanicStatus: MechanicStatus | null;
  nextStatuses: MechanicStatus[];
  canReopen: boolean;
  reopenCount: number;
  reportedIssue: string | null;
  technicalNotes: string | null;
  createdAt: string;
  finishedAt: string | null;
  client: { name: string };
  vehicle: { licensePlate: string; brand: string; model: string; year: number; color: string | null; currentKm: number };
  items: { id: string; itemType: 'SERVICE' | 'PRODUCT'; quantity: number; service: { name: string; estimatedMinutes: number } | null; product: { name: string; sku: string } | null }[];
  observations: Observation[];
}

const TYPE_LABEL: Record<Observation['type'], string> = {
  ORCAMENTO_CLIENTE: 'Cliente',
  TECNICA_MECANICO: 'Técnica',
  REABERTURA: 'Reabertura',
};
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function MecanicoOsPage() {
  const { id } = useParams<{ id: string }>();
  const [os, setOs] = useState<MechanicOs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      fetchApi<MechanicOs>(`/mecanico/os/${id}`, { signal })
        .then((data) => {
          setError(null);
          setOs(data);
        })
        .catch((err) => !signal?.aborted && setError(errorMessage(err)));
    },
    [id],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  async function advance(target: MechanicStatus) {
    setActionError(null);
    setBusy(target);
    try {
      const updated = await fetchApi<MechanicOs>(`/mecanico/os/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: target }),
        successToast: `Status: ${MECHANIC_LABEL[target]}.`,
        errorToast: false,
      });
      setOs(updated);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setNoteError(null);
    if (note.trim().length < 2) return setNoteError('Escreva a observação.');
    setBusy('note');
    try {
      const created = await fetchApi<Observation>(`/mecanico/os/${id}/observations`, {
        method: 'POST',
        body: JSON.stringify({ message: note.trim() }),
        successToast: 'Observação registrada.',
        errorToast: false,
      });
      setOs((cur) => (cur ? { ...cur, observations: [...cur.observations, created] } : cur));
      setNote('');
    } catch (err) {
      setNoteError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (error && !os) return <LightError message={error} onRetry={() => load()} />;
  if (!os) return <LightSkeleton rows={3} />;

  const info = STATUS_INFO[os.status] ?? STATUS_INFO.DRAFT;
  const concluded = os.status === 'COMPLETED' || os.status === 'BILLED';

  return (
    <div className="space-y-4">
      <Link href="/mecanico/dashboard" className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-graphite hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Minhas O.S
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-4 min-w-0">
          <Card accent={info.accent}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-mono text-2xl font-extrabold">O.S #{os.code}</h1>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Car className="w-4 h-4 shrink-0" aria-hidden />
                  {os.vehicle.brand} {os.vehicle.model} {os.vehicle.year} · {os.vehicle.licensePlate}
                </p>
                <p className="text-xs text-brand-steel">
                  {os.client.name}
                  {os.vehicle.color ? ` · ${os.vehicle.color}` : ''} · {os.vehicle.currentKm.toLocaleString('pt-BR')} km
                </p>
              </div>
              <Badge tone={concluded ? 'deep' : os.mechanicStatus === 'EM_EXECUCAO' ? 'neon' : 'muted'}>
                {os.mechanicStatus ? MECHANIC_LABEL[os.mechanicStatus] : info.label}
              </Badge>
            </div>
            <div className="mt-4">
              <StatusProgress status={os.status} showLabels />
            </div>
            {os.reportedIssue && (
              <p className="mt-4 text-sm">
                <span className="font-semibold">Relato do cliente:</span> {os.reportedIssue}
              </p>
            )}
            {os.technicalNotes && (
              <p className="mt-2 text-sm whitespace-pre-wrap break-words">
                <span className="font-semibold">Diagnóstico:</span> {os.technicalNotes}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="font-extrabold mb-3">Serviços e peças</h2>
            {os.items.length === 0 ? (
              <p className="text-sm text-brand-steel">Nenhum item lançado.</p>
            ) : (
              <ul className="divide-y divide-brand-steel/15">
                {os.items.map((it) => (
                  <li key={it.id} className="py-2.5 flex items-start gap-3 text-sm">
                    <span className="mt-0.5 text-brand-steel" aria-hidden>
                      {it.itemType === 'SERVICE' ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words">{it.service?.name ?? it.product?.name}</span>
                      <span className="text-xs text-brand-steel">
                        {it.itemType === 'SERVICE'
                          ? `Serviço · ~${it.service?.estimatedMinutes ?? 60} min`
                          : `Peça · SKU ${it.product?.sku}`}
                      </span>
                    </span>
                    <span className="font-bold tabular-nums">× {it.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-extrabold mb-3 flex items-center gap-2">
              <History className="w-4 h-4" aria-hidden />
              Histórico de observações
            </h2>
            {os.observations.length === 0 ? (
              <p className="text-sm text-brand-steel">Nenhuma observação ainda.</p>
            ) : (
              <ol className="space-y-2">
                {os.observations.map((o) => (
                  <li key={o.id} className={`rounded-xl p-3 text-sm border-l-4 ${o.type === 'REABERTURA' ? 'border-l-red-600 bg-red-50' : o.type === 'ORCAMENTO_CLIENTE' ? 'border-l-neon-primary bg-neon-muted' : 'border-l-brand-graphite bg-surface-offwhite'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold">
                        {o.authorName} · {TYPE_LABEL[o.type]}
                      </span>
                      <span className="text-brand-steel">{brDate(o.createdAt, true)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words">{o.message}</p>
                  </li>
                ))}
              </ol>
            )}
            <form onSubmit={addNote} className="mt-4 space-y-3">
              <TextArea label="Nova observação técnica" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} error={noteError} placeholder="Ex.: pastilhas trocadas, disco dentro da medida." />
              <Button type="submit" variant="secondary" block loading={busy === 'note'} icon={<MessageSquarePlus className="w-4 h-4" aria-hidden />}>
                Registrar observação
              </Button>
            </form>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-20">
          <h2 className="font-extrabold mb-3">Andamento</h2>
          {os.nextStatuses.length > 0 ? (
            <div className="grid gap-2">
              {os.nextStatuses.map((s, i) => (
                <Button key={s} variant={i === 0 ? 'primary' : 'secondary'} block loading={busy === s} disabled={!!busy} onClick={() => advance(s)} className="min-h-12">
                  {MECHANIC_ACTION[s] ?? MECHANIC_LABEL[s]}
                </Button>
              ))}
            </div>
          ) : !concluded ? (
            <p className="text-sm text-brand-steel">
              {os.status === 'QUOTE' ? 'Aguardando a aprovação do orçamento pelo cliente.' : 'Nenhuma ação disponível neste status.'}
            </p>
          ) : null}

          {os.status === 'COMPLETED' &&
            (os.canReopen ? (
              <Button variant="danger" block className="mt-2 min-h-12" icon={<RotateCcw className="w-4 h-4" aria-hidden />} onClick={() => setReopening(true)}>
                Reabrir O.S
              </Button>
            ) : (
              <p className="mt-2 text-sm flex items-start gap-2 bg-surface-offwhite rounded-xl p-3">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                Esta O.S já foi reaberta uma vez. Apenas Administrador ou Gerente Geral podem reabrir novamente.
              </p>
            ))}
          {os.status === 'BILLED' && <p className="mt-2 text-sm text-brand-steel">O.S concluída e faturada.</p>}
          <InlineError message={actionError} />
        </Card>
      </div>

      {reopening && (
        <ReopenModal
          id={os.id}
          code={os.code}
          onClose={(updated) => {
            setReopening(false);
            if (updated) setOs(updated);
          }}
        />
      )}
    </div>
  );
}

function ReopenModal({ id, code, onClose }: { id: string; code: number; onClose: (updated?: MechanicOs) => void }) {
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (justification.trim().length < 5) return setError('A justificativa é obrigatória (mínimo de 5 caracteres).');
    setSaving(true);
    try {
      const updated = await fetchApi<MechanicOs>(`/mecanico/os/${id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ justification: justification.trim() }),
        successToast: `O.S #${code} reaberta: voltou para Em execução.`,
        errorToast: false,
      });
      onClose(updated);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reabrir O.S #${code}`} onClose={() => onClose()}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-brand-steel">
          A O.S volta para <strong>Em execução</strong>. O mecânico pode reabrir uma única vez; depois, só Administrador ou Gerente Geral.
        </p>
        <TextArea label="Justificativa" required maxLength={1000} value={justification} onChange={(e) => setJustification(e.target.value)} error={error} autoFocus />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => onClose()}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={saving} icon={<RotateCcw className="w-4 h-4" aria-hidden />}>
            Confirmar reabertura
          </Button>
        </div>
      </form>
    </Modal>
  );
}
