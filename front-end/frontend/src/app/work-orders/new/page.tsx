'use client';

import React, { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Car,
  CheckCircle,
  DollarSign,
  FileText,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
  UserCog,
  Wrench,
} from 'lucide-react';
import { fetchApi } from '@/services/api';
import { isPrivilegedUser, useAuth } from '@/services/auth';
import { MechanicSelect, useMechanics, type MechanicOption } from '@/components/mechanic/MechanicSelect';
import { errorMessage as errMsg } from '@/components/crud';
import { Field, fieldCls } from '@/components/ui';
import { cn } from '@/lib/cn';

interface VehicleFound {
  id: string;
  licensePlate: string;
  brand: string;
  model: string;
  year: number;
  currentKm: number;
  client: {
    id: string;
    name: string;
    phone: string;
    document: string | null;
  };
}

interface SelectedItem {
  key: string;
  itemType: 'SERVICE' | 'PRODUCT';
  refId: string;
  name: string;
  quantity: number;
  /** Preço unitário em centavos (evita erro de arredondamento na soma da tela) */
  unitCents: number;
  /** Só serviços: mecânico que executa ('' = responsável da OS) */
  mechanicId: string;
}

interface CatalogOption {
  id: string;
  name: string;
  cents: number;
  stock?: number;
}

const toCents = (v: string | number) => Math.round(Number(v) * 100);
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Cabeçalho numerado de cada etapa do formulário. */
function Section({
  step,
  icon,
  title,
  subtitle,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-white border border-line/70 rounded-2xl p-4 sm:p-6 shadow-sm">
      <header className="flex items-start gap-3 mb-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-graphite text-neon-primary text-sm font-bold">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-brand-ink flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {subtitle && <p className="text-xs sm:text-sm text-brand-steel">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Quantidade com botões − / + (alvo de toque de 44px). */
function QtyStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex h-11 items-stretch rounded-xl border border-line bg-surface-white" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="w-10 grid place-items-center text-brand-graphite disabled:opacity-40"
        aria-label="Diminuir quantidade"
      >
        <Minus className="w-4 h-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-12 bg-transparent text-center text-sm font-semibold text-brand-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        aria-label={label}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-10 grid place-items-center text-brand-graphite"
        aria-label="Aumentar quantidade"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function RemoveButton({ onClick, name }: { onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 w-11 shrink-0 grid place-items-center rounded-xl text-red-700 hover:bg-red-500/10 transition-colors"
      title={`Remover ${name}`}
      aria-label={`Remover ${name}`}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

/** Seletor "adicionar do catálogo": escolheu, adiciona e volta para o placeholder. */
function CatalogPicker({
  label,
  placeholder,
  options,
  onPick,
  describe,
}: {
  label: string;
  placeholder: string;
  options: CatalogOption[];
  onPick: (o: CatalogOption) => void;
  describe: (o: CatalogOption) => string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value=""
        onChange={(e) => {
          const o = options.find((x) => x.id === e.target.value);
          if (o) onPick(o);
        }}
        className={fieldCls}
      >
        <option value="" disabled>
          {options.length ? placeholder : 'Nada cadastrado no catálogo'}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {describe(o)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function NewWorkOrderPage() {
  const router = useRouter();

  // Catálogo ativo (cadastrado na tela Peças & Serviços)
  const [availableServices, setAvailableServices] = useState<CatalogOption[]>([]);
  const [availableProducts, setAvailableProducts] = useState<CatalogOption[]>([]);

  useEffect(() => {
    fetchApi<{ id: string; name: string; basePrice: string }[]>('/catalog/services')
      .then((list) => setAvailableServices(list.map((s) => ({ id: s.id, name: s.name, cents: toCents(s.basePrice) }))))
      .catch(() => setAvailableServices([]));
    fetchApi<{ id: string; name: string; salePrice: string; stockQuantity: number }[]>('/catalog/products')
      .then((list) =>
        setAvailableProducts(list.map((p) => ({ id: p.id, name: p.name, cents: toCents(p.salePrice), stock: p.stockQuantity }))),
      )
      .catch(() => setAvailableProducts([]));
  }, []);

  // Busca de veículo/cliente
  const [plateInput, setPlateInput] = useState('');
  const [searchingPlate, setSearchingPlate] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleFound | null>(null);
  const [searchError, setSearchError] = useState('');

  // Dados da OS
  const [reportedIssue, setReportedIssue] = useState('');
  // Mecânicos (responsável e de cada serviço): só Administrador e Gerente Geral escolhem na abertura
  const { user } = useAuth();
  const canAssign = isPrivilegedUser(user);
  const mech = useMechanics(canAssign);
  const [operatorId, setOperatorId] = useState('');
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [initialStatus, setInitialStatus] = useState<'QUOTE' | 'DRAFT'>('QUOTE');
  const [discountInput, setDiscountInput] = useState('');
  const issueId = useId();
  const discountId = useId();

  async function handleSearchPlate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!plateInput.trim()) return;
    try {
      setSearchingPlate(true);
      setSearchError('');
      setVehicle(null);
      const cleanPlate = plateInput.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const data = await fetchApi<VehicleFound>(`/clients/vehicles/by-plate/${cleanPlate}`);
      setVehicle(data);
    } catch (err: unknown) {
      setSearchError(errMsg(err) || 'Veículo não encontrado para a placa informada.');
    } finally {
      setSearchingPlate(false);
    }
  }

  function addItem(itemType: SelectedItem['itemType'], o: CatalogOption) {
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), itemType, refId: o.id, name: o.name, quantity: 1, unitCents: o.cents, mechanicId: '' },
    ]);
  }

  function updateItem(key: string, patch: Partial<SelectedItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  const services = items.filter((it) => it.itemType === 'SERVICE');
  const products = items.filter((it) => it.itemType === 'PRODUCT');
  const lineCents = (it: SelectedItem) => it.unitCents * it.quantity;
  const totalServices = services.reduce((acc, it) => acc + lineCents(it), 0);
  const totalProducts = products.reduce((acc, it) => acc + lineCents(it), 0);
  const discount = Math.max(0, toCents((discountInput.replace(',', '.') || '0')) || 0);
  const discountTooBig = discount > totalProducts;
  const finalTotal = Math.max(0, totalServices + totalProducts - discount);

  const mechanicName = (id: string, list: MechanicOption[]) => list.find((m) => m.id === id)?.name ?? 'Mecânico';
  // Sem responsável escolhido, o mecânico do 1º serviço assume a OS (mesma regra do servidor)
  const effectiveOperator = operatorId || services.find((s) => s.mechanicId)?.mechanicId || '';

  // Mão de obra por mecânico (só valor dos serviços; a comissão fica no financeiro)
  const laborMap = new Map<string, { key: string; name: string; cents: number; count: number }>();
  for (const s of services) {
    const who = s.mechanicId || effectiveOperator;
    const key = who || 'none';
    const entry = laborMap.get(key) ?? { key, name: who ? mechanicName(who, mech.mechanics) : 'Sem mecânico (atribuir depois)', cents: 0, count: 0 };
    entry.cents += lineCents(s);
    entry.count += 1;
    laborMap.set(key, entry);
  }
  const laborByMechanic = [...laborMap.values()];

  async function handleSubmitOrder() {
    if (!vehicle) {
      setSubmitError('Identifique o veículo e o cliente antes de abrir a OS.');
      return;
    }
    // Desconto só nas peças (regra da oficina): nunca reduz a mão de obra
    if (discountTooBig) {
      setSubmitError(`O desconto vale só para peças e não pode passar de ${brl(totalProducts)}.`);
      return;
    }
    if (items.length === 0) {
      setSubmitError('Adicione ao menos um serviço ou peça ao orçamento.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');
      const payload = {
        clientId: vehicle.client.id,
        vehicleId: vehicle.id,
        reportedIssue: reportedIssue.trim() || undefined,
        operatorId: canAssign && operatorId ? operatorId : undefined,
        status: initialStatus,
        discount: discount ? discount / 100 : undefined,
        items: items.map((it) => ({
          itemType: it.itemType,
          serviceId: it.itemType === 'SERVICE' ? it.refId : undefined,
          productId: it.itemType === 'PRODUCT' ? it.refId : undefined,
          mechanicId: canAssign && it.itemType === 'SERVICE' && it.mechanicId ? it.mechanicId : undefined,
          quantity: it.quantity,
        })),
      };
      const created = await fetchApi<{ id: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
        successToast: initialStatus === 'DRAFT' ? 'Rascunho salvo.' : 'Orçamento criado.',
      });
      router.push(`/os/${created.id}`);
    } catch (err: unknown) {
      setSubmitError(errMsg(err) || 'Erro ao abrir a Ordem de Serviço.');
    } finally {
      setSubmitting(false);
    }
  }

  const responsibleLabel = operatorId
    ? `Responsável (${mechanicName(operatorId, mech.mechanics)})`
    : 'Responsável da OS';

  return (
    <div className="min-h-full bg-surface-offwhite text-brand-ink px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* Cabeçalho */}
      <div className="max-w-6xl mx-auto mb-5 sm:mb-6">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 min-h-11 text-sm text-brand-graphite hover:text-brand-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para o Painel Geral
        </button>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-ink flex items-center gap-2.5">
          <Wrench className="w-6 h-6 sm:w-7 sm:h-7 text-neon-deep shrink-0" />
          Nova Ordem de Serviço
        </h1>
        <p className="text-sm text-brand-graphite mt-1">
          Identifique o carro, registre o relato e monte o orçamento. Cada serviço pode ficar com um mecânico diferente.
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 lg:gap-6 lg:items-start">
        <div className="space-y-5 min-w-0">
          {/* 1. Veículo */}
          <Section step={1} icon={<Car className="w-5 h-5 text-neon-deep" />} title="Veículo e cliente" subtitle="Busque pela placa cadastrada.">
            <form onSubmit={handleSearchPlate} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-steel pointer-events-none" />
                <input
                  type="text"
                  placeholder="Placa (ex.: BRA2E19)"
                  aria-label="Placa do veículo"
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                  className={cn(fieldCls, 'pl-10 font-mono tracking-wider uppercase')}
                />
              </div>
              <button
                type="submit"
                disabled={searchingPlate || !plateInput}
                className="min-h-12 bg-neon-primary hover:bg-neon-soft disabled:opacity-50 text-brand-ink font-bold px-6 rounded-xl text-sm transition-colors"
              >
                {searchingPlate ? 'Buscando...' : 'Consultar placa'}
              </button>
            </form>

            {searchError && (
              <div role="alert" className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {searchError}
              </div>
            )}

            {vehicle && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-neon-deep/30 bg-neon-muted/60 p-3.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-neon-deep">Veículo</span>
                  <p className="font-bold text-brand-ink text-base mt-0.5">
                    {vehicle.brand} {vehicle.model} ({vehicle.year})
                  </p>
                  <p className="text-xs text-brand-graphite font-mono mt-0.5">
                    {vehicle.licensePlate} · {vehicle.currentKm ? `${vehicle.currentKm.toLocaleString('pt-BR')} km` : 'km não informada'}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface-offwhite p-3.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-steel">Proprietário</span>
                  <p className="font-bold text-brand-ink text-base mt-0.5">{vehicle.client.name}</p>
                  <p className="text-xs text-brand-graphite mt-0.5">
                    {vehicle.client.phone} · {vehicle.client.document || 'documento não informado'}
                  </p>
                </div>
              </div>
            )}
          </Section>

          {/* 2. Atendimento */}
          <Section step={2} icon={<FileText className="w-5 h-5 text-neon-deep" />} title="Atendimento">
            <div className={cn('grid grid-cols-1 gap-4', canAssign && 'md:grid-cols-2')}>
              <Field label="Relato do cliente" htmlFor={issueId}>
                <textarea
                  id={issueId}
                  rows={canAssign ? 4 : 3}
                  placeholder="O que o cliente relatou (barulho ao frear, luz da injeção acesa, revisão...)"
                  value={reportedIssue}
                  onChange={(e) => setReportedIssue(e.target.value)}
                  className={cn(fieldCls, 'py-3 resize-y')}
                />
              </Field>
              {canAssign && (
                <MechanicSelect
                  value={operatorId}
                  onChange={setOperatorId}
                  mechanics={mech.mechanics}
                  loading={mech.loading}
                  error={mech.error}
                  emptyLabel="Sem responsável (atribuir depois)"
                  hint="Dono da OS: fica com os serviços sem mecânico próprio. Sem escolha, o mecânico do 1º serviço assume."
                />
              )}
            </div>
          </Section>

          {/* 3. Serviços */}
          <Section
            step={3}
            icon={<UserCog className="w-5 h-5 text-neon-deep" />}
            title="Serviços"
            subtitle={canAssign ? 'Escolha o mecânico de cada serviço (ex.: alinhamento com o alinhador).' : undefined}
          >
            <CatalogPicker
              label="Adicionar serviço"
              placeholder="Selecione um serviço..."
              options={availableServices}
              onPick={(o) => addItem('SERVICE', o)}
              describe={(o) => `${o.name} (${brl(o.cents)})`}
            />

            {services.length === 0 ? (
              <p className="mt-4 p-6 text-center text-brand-steel border border-dashed border-line rounded-xl text-sm">
                Nenhum serviço adicionado.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {services.map((it) => (
                  <li
                    key={it.key}
                    className={cn(
                      'rounded-xl border border-line bg-surface-offwhite/70 p-3 grid gap-3 items-center',
                      'grid-cols-[minmax(0,1fr)_auto]',
                      canAssign ? 'md:grid-cols-[minmax(0,1fr)_14rem_auto_6.5rem_auto]' : 'md:grid-cols-[minmax(0,1fr)_auto_6.5rem_auto]',
                    )}
                  >
                    <div className="min-w-0 md:col-auto">
                      <p className="font-semibold text-brand-ink truncate">{it.name}</p>
                      <p className="text-xs text-brand-steel">{brl(it.unitCents)} un.</p>
                    </div>
                    <div className="md:hidden justify-self-end">
                      <RemoveButton onClick={() => removeItem(it.key)} name={it.name} />
                    </div>
                    {canAssign && (
                      <select
                        value={it.mechanicId}
                        onChange={(e) => updateItem(it.key, { mechanicId: e.target.value })}
                        disabled={mech.loading}
                        aria-label={`Mecânico do serviço ${it.name}`}
                        className={cn(fieldCls, 'min-h-11 col-span-2 md:col-span-1')}
                      >
                        <option value="">{responsibleLabel}</option>
                        {mech.mechanics.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.profile === 'MECANICO_CHEFE' ? ' (Chefe)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <QtyStepper value={it.quantity} onChange={(n) => updateItem(it.key, { quantity: n })} label={`Quantidade de ${it.name}`} />
                    <p className="text-right font-bold text-brand-ink tabular-nums">{brl(lineCents(it))}</p>
                    <div className="hidden md:block">
                      <RemoveButton onClick={() => removeItem(it.key)} name={it.name} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 4. Peças */}
          <Section step={4} icon={<Package className="w-5 h-5 text-neon-deep" />} title="Peças e materiais" subtitle="Saem do estoque só quando o cliente aprova.">
            <CatalogPicker
              label="Adicionar peça"
              placeholder="Selecione uma peça..."
              options={availableProducts}
              onPick={(o) => addItem('PRODUCT', o)}
              describe={(o) => `${o.name} (${brl(o.cents)} · estoque ${o.stock ?? 0})`}
            />

            {products.length === 0 ? (
              <p className="mt-4 p-6 text-center text-brand-steel border border-dashed border-line rounded-xl text-sm">
                Nenhuma peça adicionada.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {products.map((it) => (
                  <li
                    key={it.key}
                    className="rounded-xl border border-line bg-surface-offwhite/70 p-3 grid gap-3 items-center grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_6.5rem_auto]"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-ink truncate">{it.name}</p>
                      <p className="text-xs text-brand-steel">{brl(it.unitCents)} un.</p>
                    </div>
                    <div className="md:hidden justify-self-end">
                      <RemoveButton onClick={() => removeItem(it.key)} name={it.name} />
                    </div>
                    <QtyStepper value={it.quantity} onChange={(n) => updateItem(it.key, { quantity: n })} label={`Quantidade de ${it.name}`} />
                    <p className="text-right font-bold text-brand-ink tabular-nums">{brl(lineCents(it))}</p>
                    <div className="hidden md:block">
                      <RemoveButton onClick={() => removeItem(it.key)} name={it.name} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Resumo */}
        <aside className="bg-surface-white border border-line/70 rounded-2xl p-4 sm:p-6 shadow-sm lg:sticky lg:top-20">
          <h2 className="text-lg font-semibold text-brand-ink flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-neon-deep" />
            Resumo do orçamento
          </h2>

          <dl className="space-y-2.5 text-sm border-b border-line pb-4 mb-4">
            <div className="flex justify-between gap-3 text-brand-graphite">
              <dt>Serviços ({services.length})</dt>
              <dd className="font-semibold text-brand-ink tabular-nums">{brl(totalServices)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-brand-graphite">
              <dt>Peças ({products.length})</dt>
              <dd className="font-semibold text-brand-ink tabular-nums">{brl(totalProducts)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-brand-graphite pt-1">
              <label htmlFor={discountId}>Desconto em peças</label>
              <input
                id={discountId}
                inputMode="decimal"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
                aria-invalid={discountTooBig}
                className={cn(fieldCls, 'w-32 min-h-11 text-right')}
              />
            </div>
            {discountTooBig && <p className="text-xs font-semibold text-red-700">O desconto vale só para peças e passa do total de peças.</p>}
          </dl>

          {canAssign && laborByMechanic.length > 0 && (
            <div className="border-b border-line pb-4 mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-steel mb-2">Serviços por mecânico</h3>
              <ul className="space-y-1.5 text-sm">
                {laborByMechanic.map((m) => (
                  <li key={m.key} className="flex justify-between gap-3">
                    <span className="text-brand-graphite min-w-0 truncate">
                      {m.name} <span className="text-brand-steel">· {m.count} {m.count === 1 ? 'serviço' : 'serviços'}</span>
                    </span>
                    <span className="font-semibold text-brand-ink tabular-nums">{brl(m.cents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1 bg-surface-offwhite border border-line rounded-xl p-1 mb-4 text-sm font-semibold" role="group" aria-label="Tipo de abertura">
            {(
              [
                ['QUOTE', 'Orçamento'],
                ['DRAFT', 'Rascunho'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={initialStatus === key}
                onClick={() => setInitialStatus(key)}
                className={cn('min-h-10 rounded-lg transition-colors', initialStatus === key ? 'bg-neon-primary text-brand-ink' : 'text-brand-graphite hover:bg-surface-muted')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-baseline gap-3 mb-5">
            <span className="text-base font-bold text-brand-ink">Total da OS</span>
            <span className="text-2xl font-extrabold text-neon-deep tabular-nums">{brl(finalTotal)}</span>
          </div>

          {submitError && (
            <div role="alert" className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={submitting || !vehicle || items.length === 0}
            className="w-full min-h-12 bg-neon-primary hover:bg-neon-soft disabled:opacity-50 text-brand-ink font-extrabold px-4 rounded-xl text-base flex items-center justify-center gap-2 transition-colors"
          >
            {submitting ? (
              'Gerando Ordem de Serviço...'
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                {initialStatus === 'DRAFT' ? 'Salvar rascunho' : 'Abrir Ordem de Serviço'}
              </>
            )}
          </button>

          <p className="text-xs text-brand-steel text-center mt-3">
            {initialStatus === 'DRAFT'
              ? 'O rascunho fica só com a equipe; envie ao cliente quando estiver pronto.'
              : 'O orçamento fica aguardando aprovação do cliente. As peças só saem do estoque na aprovação.'}
          </p>
        </aside>
      </div>
    </div>
  );
}
