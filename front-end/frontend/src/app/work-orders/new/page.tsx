'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Wrench, 
  Car, 
  User, 
  Search, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertCircle,
  ArrowLeft,
  DollarSign,
  Package,
  FileText
} from 'lucide-react';
import { fetchApi } from '@/services/api';
import { isPrivilegedUser, useAuth } from '@/services/auth';
import { MechanicSelect, useMechanics } from '@/components/mechanic/MechanicSelect';
import { errorMessage as errMsg } from '@/components/crud';

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
  id: string;
  itemType: 'SERVICE' | 'PRODUCT';
  name: string;
  quantity: number;
  unitPrice: number;
  serviceId?: string;
  productId?: string;
}

interface CatalogOption {
  id: string;
  name: string;
  price: number;
  stock?: number;
}

export default function NewWorkOrderPage() {
  const router = useRouter();

  // Catálogo ativo (cadastrado na tela Peças & Serviços)
  const [availableServices, setAvailableServices] = useState<CatalogOption[]>([]);
  const [availableProducts, setAvailableProducts] = useState<CatalogOption[]>([]);

  useEffect(() => {
    fetchApi<{ id: string; name: string; basePrice: string }[]>('/catalog/services')
      .then((list) => setAvailableServices(list.map((s) => ({ id: s.id, name: s.name, price: Number(s.basePrice) }))))
      .catch(() => setAvailableServices([]));
    fetchApi<{ id: string; name: string; salePrice: string; stockQuantity: number }[]>('/catalog/products')
      .then((list) =>
        setAvailableProducts(list.map((p) => ({ id: p.id, name: p.name, price: Number(p.salePrice), stock: p.stockQuantity }))),
      )
      .catch(() => setAvailableProducts([]));
  }, []);

  // Estados de busca de veículo/cliente
  const [plateInput, setPlateInput] = useState('');
  const [searchingPlate, setSearchingPlate] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleFound | null>(null);
  const [searchError, setSearchError] = useState('');

  // Estados da OS
  const [reportedIssue, setReportedIssue] = useState('');
  // Mecânico responsável: só Administrador e Gerente Geral escolhem na abertura
  const { user } = useAuth();
  const canAssign = isPrivilegedUser(user);
  const mech = useMechanics(canAssign);
  const [operatorId, setOperatorId] = useState('');
  const [technicalNotes, setTechnicalNotes] = useState('');
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [initialStatus, setInitialStatus] = useState<'QUOTE' | 'DRAFT'>('QUOTE');
  const [discountInput, setDiscountInput] = useState('');

  // Busca do veículo pela placa
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

  // Adiciona serviço com o ID real do banco
  function handleAddService(name: string, price: number, serviceId?: string) {
    const newItem: SelectedItem = {
      id: Math.random().toString(),
      itemType: 'SERVICE',
      name,
      quantity: 1,
      unitPrice: price,
      serviceId,
    };
    setItems((prev) => [...prev, newItem]);
  }

  // Adiciona produto com o ID real do banco
  function handleAddProduct(name: string, price: number, productId?: string) {
    const newItem: SelectedItem = {
      id: Math.random().toString(),
      itemType: 'PRODUCT',
      name,
      quantity: 1,
      unitPrice: price,
      productId,
    };
    setItems((prev) => [...prev, newItem]);
  }

  // Atualização de quantidade
  function handleUpdateQuantity(index: number, newQty: number) {
    if (newQty < 1) return;
    setItems((prev) => {
      const copy = [...prev];
      copy[index].quantity = newQty;
      return copy;
    });
  }

  // Remoção de item
  function handleRemoveItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Cálculos de totais em tempo real
  const totalServices = items
    .filter((it) => it.itemType === 'SERVICE')
    .reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);

  const totalProducts = items
    .filter((it) => it.itemType === 'PRODUCT')
    .reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);

  const discount = Math.max(0, Math.round((Number(discountInput.replace(',', '.')) || 0) * 100) / 100);
  const grossTotal = totalServices + totalProducts;
  const finalTotal = grossTotal - discount;

  // Envio da OS ao backend
  async function handleSubmitOrder() {
    if (!vehicle) {
      setSubmitError('Identifique o veículo e cliente antes de abrir a OS.');
      return;
    }
    if (discount > grossTotal) {
      setSubmitError('O desconto não pode ser maior que o valor total da OS.');
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
        technicalNotes: technicalNotes.trim() || undefined,
        operatorId: canAssign && operatorId ? operatorId : undefined,
        status: initialStatus,
        discount: discount || undefined,
        items: items.map((it) => ({
          itemType: it.itemType,
          serviceId: it.itemType === 'SERVICE' ? it.serviceId : undefined,
          productId: it.itemType === 'PRODUCT' ? it.productId : undefined,
          quantity: it.quantity,
        })),
      };

      const created = await fetchApi('/work-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
        successToast: initialStatus === 'DRAFT' ? 'Rascunho salvo.' : 'Orçamento criado.',
      });

      // Redireciona para o detalhe da OS ou volta para a home
      router.push(`/os/${created.id}`);
    } catch (err: unknown) {
      setSubmitError(errMsg(err) || 'Erro ao abrir a Ordem de Serviço.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-surface-offwhite text-brand-ink px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* Cabeçalho */}
      <div className="max-w-5xl mx-auto mb-5 sm:mb-8">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 text-sm text-brand-graphite hover:text-brand-ink mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para o Painel Geral
        </button>

        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-ink flex items-center gap-2.5">
          <Wrench className="w-6 h-6 sm:w-7 sm:h-7 text-neon-deep shrink-0" />
          Abertura de Ordem de Serviço (Balcão)
        </h1>
        <p className="text-brand-graphite mt-1">
          Identifique o carro pela placa, registre a queixa e monte o orçamento.
        </p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
        {/* Coluna 1 & 2: Formulário Operacional */}
        <div className="lg:col-span-2 space-y-5 sm:space-y-6">
          {/* Etapa 1: Busca do Carro */}
          <div className="bg-surface-muted/80 border border-line/60 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-brand-ink flex items-center gap-2 mb-4">
              <Car className="w-5 h-5 text-neon-deep" />
              1. Identificação do Veículo
            </h2>

            <form onSubmit={handleSearchPlate} className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-graphite" />
                <input
                  type="text"
                  placeholder="Ex: BRA2E19 ou MER8I90"
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                  className="w-full bg-surface-white border border-line rounded-lg pl-9 pr-4 py-2.5 font-mono text-sm tracking-wider uppercase text-brand-ink placeholder-brand-steel focus:outline-none focus:border-neon-deep"
                />
              </div>
              <button
                type="submit"
                disabled={searchingPlate || !plateInput}
                className="bg-neon-primary hover:bg-neon-deep disabled:opacity-50 text-brand-ink font-bold px-5 py-2.5 rounded-lg text-sm transition-all"
              >
                {searchingPlate ? 'Buscando...' : 'Consultar Placa'}
              </button>
            </form>

            {searchError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {searchError}
              </div>
            )}

            {vehicle && (
              <div className="mt-4 p-4 rounded-lg bg-surface-white/90 border border-emerald-500/30 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-brand-graphite block">Veículo Confirmado</span>
                  <div className="font-bold text-brand-ink text-base">
                    {vehicle.brand} {vehicle.model} ({vehicle.year})
                  </div>
                  <div className="text-xs text-brand-graphite font-mono mt-0.5">
                    Placa: {vehicle.licensePlate} • {vehicle.currentKm ? `${vehicle.currentKm} km` : 'Km não informada'}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-brand-graphite block">Proprietário</span>
                  <div className="font-bold text-brand-ink text-base">{vehicle.client.name}</div>
                  <div className="text-xs text-brand-graphite">
                    Tel: {vehicle.client.phone} • Doc: {vehicle.client.document || 'não informado'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Etapa 2: Queixa do Cliente */}
          <div className="bg-surface-muted/80 border border-line/60 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-brand-ink flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-neon-deep" />
              2. Queixa / Relato do Cliente
            </h2>
            <textarea
              rows={3}
              placeholder="Descreva o que o cliente relatou (ex: barulho ao frear, luz da injeção acesa, revisão preventiva...)"
              value={reportedIssue}
              onChange={(e) => setReportedIssue(e.target.value)}
              className="w-full bg-surface-white border border-line rounded-lg p-3 text-sm text-brand-ink placeholder-brand-steel focus:outline-none focus:border-neon-deep"
            />
            {canAssign && (
              <div className="mt-4">
                <MechanicSelect
                  value={operatorId}
                  onChange={setOperatorId}
                  mechanics={mech.mechanics}
                  loading={mech.loading}
                  error={mech.error}
                  emptyLabel="Sem mecânico (atribuir depois)"
                  hint="Com mecânico escolhido, a OS já aparece na Área do Mecânico dele."
                />
              </div>
            )}
          </div>

          {/* Etapa 3: Itens da OS */}
          <div className="bg-surface-muted/80 border border-line/60 rounded-2xl p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-brand-ink flex items-center gap-2">
                <Package className="w-5 h-5 text-neon-deep" />
                3. Serviços e Peças do Orçamento
              </h2>
            </div>

            {/* Adicionador Rápido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div>
                <label className="text-xs text-brand-graphite block mb-1">Adicionar Serviço:</label>
                <select
                  onChange={(e) => {
                    const srv = availableServices.find((s) => s.id === e.target.value);
                    if (srv) handleAddService(srv.name, srv.price, srv.id);
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="w-full bg-surface-white border border-line rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:border-neon-deep"
                >
                  <option value="" disabled>Selecione um serviço...</option>
                  {availableServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (R$ {s.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-brand-graphite block mb-1">Adicionar Peça / Produto:</label>
                <select
                  onChange={(e) => {
                    const prod = availableProducts.find((p) => p.id === e.target.value);
                    if (prod) handleAddProduct(prod.name, prod.price, prod.id);
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="w-full bg-surface-white border border-line rounded-lg px-3 py-2 text-sm text-brand-ink focus:outline-none focus:border-neon-deep"
                >
                  <option value="" disabled>Selecione uma peça...</option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (R$ {p.price.toFixed(2)} - Est: {p.stock})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lista de Itens Adicionados */}
            {items.length === 0 ? (
              <div className="p-8 text-center text-brand-steel border border-dashed border-line rounded-lg text-sm">
                Nenhum serviço ou peça inserido. Selecione nos campos acima.
              </div>
            ) : (
              <div className="divide-y divide-line/60 border border-line/60 rounded-lg overflow-hidden">
                {items.map((it, idx) => (
                  <div key={it.id} className="p-3 bg-surface-white/50 flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          it.itemType === 'SERVICE' ? 'bg-sky-500/20 text-sky-700' : 'bg-emerald-500/20 text-emerald-700'
                        }`}>
                          {it.itemType === 'SERVICE' ? 'Serviço' : 'Peça'}
                        </span>
                        <span className="font-medium text-brand-ink">{it.name}</span>
                      </div>
                      <div className="text-xs text-brand-graphite mt-0.5">
                        R$ {it.unitPrice.toFixed(2)} un.
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-surface-muted border border-line rounded-md px-2 py-1">
                        <span className="text-xs text-brand-graphite">Qtd:</span>
                        <input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) => handleUpdateQuantity(idx, parseInt(e.target.value) || 1)}
                          className="w-12 bg-transparent text-center text-brand-ink text-sm focus:outline-none"
                        />
                      </div>

                      <div className="w-24 text-right font-semibold text-brand-ink">
                        R$ {(it.unitPrice * it.quantity).toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-700 hover:text-red-700 p-1.5 transition-colors"
                        title="Remover item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna 3: Resumo Financeiro & Ação */}
        <div className="space-y-6">
          <div className="bg-surface-muted/80 border border-line/60 rounded-2xl p-4 sm:p-6 shadow-sm lg:sticky lg:top-20">
            <h2 className="text-lg font-semibold text-brand-ink flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-emerald-700" />
              Resumo do Orçamento
            </h2>

            <div className="space-y-3 text-sm border-b border-line pb-4 mb-4">
              <div className="flex justify-between text-brand-graphite">
                <span>Total em Serviços:</span>
                <span className="font-medium text-brand-ink">R$ {totalServices.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-brand-graphite">
                <span>Total em Peças/Materiais:</span>
                <span className="font-medium text-brand-ink">R$ {totalProducts.toFixed(2)}</span>
              </div>
              <label className="flex items-center justify-between gap-3 text-brand-graphite">
                <span>Desconto (R$):</span>
                <input
                  inputMode="decimal"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="0,00"
                  className="w-28 text-right bg-surface-white border border-line rounded-lg px-2 py-1.5 text-brand-ink focus:outline-none focus:border-neon-deep"
                />
              </label>
              {discount > grossTotal && <p className="text-xs text-rose-700">O desconto passa do valor total.</p>}
            </div>

            <div className="grid grid-cols-2 gap-1 bg-surface-white border border-line rounded-lg p-1 mb-4 text-xs font-semibold">
              {([
                ['QUOTE', 'Orçamento'],
                ['DRAFT', 'Rascunho'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInitialStatus(key)}
                  className={`py-2 rounded-md ${initialStatus === key ? 'bg-neon-primary text-brand-ink' : 'text-brand-graphite'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex justify-between items-baseline mb-6">
              <span className="text-base font-bold text-brand-ink">Valor Total da OS:</span>
              <span className="text-2xl font-extrabold text-emerald-700">
                R$ {Math.max(0, finalTotal).toFixed(2)}
              </span>
            </div>

            {submitError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {submitError}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={submitting || !vehicle || items.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-brand-ink font-extrabold py-3.5 px-4 rounded-xl text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
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

            <p className="text-[11px] text-brand-steel text-center mt-3">
              {initialStatus === 'DRAFT'
                ? 'O rascunho fica só com a equipe; envie ao cliente quando estiver pronto.'
                : 'O orçamento fica aguardando aprovação. As peças só saem do estoque quando a OS é aprovada.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
