'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Car, CheckCircle2, MessageSquareText, Package, ThumbsDown, Wrench } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { Badge, Button, Card, InlineError, LightError, LightSkeleton, StatusProgress, TextArea } from '@/components/ui';
import { STATUS_INFO, brDate, brl, isPendingBudget, type BudgetStatus, type WorkOrderStatus } from '@/lib/os-status';

interface OsDetail {
  id: string;
  code: number;
  status: WorkOrderStatus;
  budgetStatus: BudgetStatus;
  totalServices: string;
  totalProducts: string;
  discount: string;
  finalAmount: string;
  reportedIssue: string | null;
  createdAt: string;
  finishedAt: string | null;
  vehicle: { licensePlate: string; brand: string; model: string; year: number };
  items: {
    id: string;
    itemType: 'SERVICE' | 'PRODUCT';
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    service: { name: string; description: string | null } | null;
    product: { name: string } | null;
  }[];
  observations: { id: string; authorName: string; message: string; createdAt: string }[];
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function ClienteOsPage() {
  const { id } = useParams<{ id: string }>();
  const [os, setOs] = useState<OsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState('');
  const [obsError, setObsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'APROVADO' | 'REPROVADO' | null>(null);
  // Depois de decidir, os botões ficam travados (mesmo que a resposta demore)
  const [decided, setDecided] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      fetchApi<OsDetail>(`/cliente/os/${id}`, { signal })
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

  async function decide(decision: 'APROVADO' | 'REPROVADO') {
    setObsError(null);
    setDecisionError(null);
    if (decision === 'REPROVADO' && observation.trim().length < 3) {
      setObsError('Conte para a oficina o motivo da reprovação.');
      return;
    }
    setSubmitting(decision);
    setDecided(true);
    try {
      const updated = await fetchApi<OsDetail>(`/cliente/os/${id}/budget-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, observation: observation.trim() || undefined }),
        successToast: decision === 'APROVADO' ? 'Orçamento aprovado! A oficina já foi avisada.' : 'Orçamento reprovado. A oficina recebeu sua observação.',
        errorToast: false,
      });
      setOs(updated);
      setObservation('');
    } catch (err) {
      setDecisionError(errorMessage(err));
      // 409 = já decidido (outra aba): recarrega; outros erros liberam nova tentativa
      if ((err as { status?: number }).status === 409) load();
      else setDecided(false);
    } finally {
      setSubmitting(null);
    }
  }

  if (error && !os) return <LightError message={error} onRetry={() => load()} />;
  if (!os) return <LightSkeleton rows={3} />;

  const info = STATUS_INFO[os.status] ?? STATUS_INFO.DRAFT;
  const pending = isPendingBudget(os) && !decided;
  const services = os.items.filter((i) => i.itemType === 'SERVICE');
  const products = os.items.filter((i) => i.itemType === 'PRODUCT');

  return (
    <div className="space-y-4">
      <Link href="/cliente" className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-graphite hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Minhas O.S
      </Link>

      <Card accent={info.accent}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-extrabold">O.S #{os.code}</h1>
            <p className="text-sm text-brand-steel flex items-center gap-1.5">
              <Car className="w-4 h-4" aria-hidden />
              {os.vehicle.brand} {os.vehicle.model} {os.vehicle.year} · {os.vehicle.licensePlate}
            </p>
          </div>
          {pending ? (
            <Badge tone="neon" pulse>
              Aguardando sua aprovação
            </Badge>
          ) : (
            <Badge tone={os.status === 'CANCELLED' ? 'danger' : info.step >= 5 ? 'deep' : 'muted'}>{info.label}</Badge>
          )}
        </div>
        <div className="mt-4">
          <StatusProgress status={os.status} showLabels />
        </div>
        {os.reportedIssue && (
          <p className="mt-4 text-sm">
            <span className="font-semibold">Relato:</span> {os.reportedIssue}
          </p>
        )}
        <p className="mt-2 text-xs text-brand-steel">Aberta em {brDate(os.createdAt)}</p>
      </Card>

      <Card>
        <h2 className="font-extrabold mb-3">Itens do orçamento</h2>
        <ItemGroup title="Serviços" icon={<Wrench className="w-4 h-4" aria-hidden />} items={services} />
        <ItemGroup title="Peças e materiais" icon={<Package className="w-4 h-4" aria-hidden />} items={products} />
        <dl className="mt-4 pt-3 border-t border-brand-steel/20 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-brand-steel">Serviços</dt>
            <dd>{brl(os.totalServices)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-steel">Peças</dt>
            <dd>{brl(os.totalProducts)}</dd>
          </div>
          {Number(os.discount) > 0 && (
            <div className="flex justify-between">
              <dt className="text-brand-steel">Desconto</dt>
              <dd>− {brl(os.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-extrabold pt-1">
            <dt>Total</dt>
            <dd>{brl(os.finalAmount)}</dd>
          </div>
        </dl>
      </Card>

      {pending && (
        <Card accent="neon">
          <h2 className="font-extrabold">Sua decisão</h2>
          <p className="text-sm text-brand-steel mb-3">
            As peças só são separadas e o serviço só começa depois da sua aprovação.
          </p>
          <TextArea
            label="Observações para o time da oficina"
            hint="Opcional ao aprovar; obrigatória ao reprovar."
            maxLength={1000}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            error={obsError}
            placeholder="Ex.: pode trocar as pastilhas; me liguem antes de qualquer serviço extra."
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              onClick={() => decide('APROVADO')}
              loading={submitting === 'APROVADO'}
              disabled={decided}
              icon={<CheckCircle2 className="w-5 h-5" aria-hidden />}
              className="min-h-12"
            >
              Aprovar Orçamento
            </Button>
            <Button
              variant="secondary"
              onClick={() => decide('REPROVADO')}
              loading={submitting === 'REPROVADO'}
              disabled={decided}
              icon={<ThumbsDown className="w-5 h-5" aria-hidden />}
              className="min-h-12"
            >
              Reprovar Orçamento
            </Button>
          </div>
        </Card>
      )}
      <InlineError message={decisionError} />

      {!pending && os.budgetStatus !== 'PENDING' && (
        <Card accent={os.budgetStatus === 'APPROVED' ? 'deep' : 'danger'}>
          <p className="text-sm font-semibold">
            {os.budgetStatus === 'APPROVED' ? 'Orçamento aprovado.' : 'Orçamento reprovado.'}
          </p>
        </Card>
      )}

      {os.observations.length > 0 && (
        <Card>
          <h2 className="font-extrabold mb-3 flex items-center gap-2">
            <MessageSquareText className="w-4 h-4" aria-hidden />
            Suas observações
          </h2>
          <ul className="space-y-2">
            {os.observations.map((o) => (
              <li key={o.id} className="bg-surface-offwhite rounded-xl p-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{o.message}</p>
                <p className="mt-1 text-xs text-brand-steel">{brDate(o.createdAt, true)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ItemGroup({ title, icon, items }: { title: string; icon: React.ReactNode; items: OsDetail['items'] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-brand-steel flex items-center gap-1.5 mb-1.5">
        {icon}
        {title}
      </h3>
      <ul className="divide-y divide-brand-steel/15">
        {items.map((it) => (
          <li key={it.id} className="py-2 flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block font-semibold break-words">{it.service?.name ?? it.product?.name ?? 'Item'}</span>
              <span className="text-xs text-brand-steel">
                {it.quantity} × {brl(it.unitPrice)}
              </span>
            </span>
            <span className="font-semibold whitespace-nowrap">{brl(it.totalPrice)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
