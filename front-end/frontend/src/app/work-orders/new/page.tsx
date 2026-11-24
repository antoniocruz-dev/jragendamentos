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
    document: string;
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
  const [technicalNotes, setTechnicalNotes] = useState('');
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

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
    } catch (err: any) {
      setSearchError(err.message || 'Veículo não encontrado para a placa informada.');
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

  const finalTotal = totalServices + totalProducts;

  // Envio da OS ao backend
  async function handleSubmitOrder() {
    if (!vehicle) {
      setSubmitError('Identifique o veículo e cliente antes de abrir a OS.');
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
      });

      // Redireciona para o detalhe da OS ou volta para a home
      router.push(`/os/${created.id}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Erro ao abrir a Ordem de Serviço.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10">
      {/* Cabeçalho */}
      <div className="max-w-5xl mx-auto mb-8">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para o Painel Geral
        </button>

        <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
          <Wrench className="w-8 h-8 text-amber-500" />
          Abertura de Ordem de Serviço (Balcão)
        </h1>
        <p className="text-slate-400 mt-1">
          Identifique o carro pela placa, registre a queixa e monte o orçamento.
        </p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna 1 & 2: Formulário Operacional */}
        <div className="lg:col-span-2 space-y-6">
          {/* Etapa 1: Busca do Carro */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Car className="w-5 h-5 text-amber-500" />
              1. Identificação do Veículo
            </h2>

            <form onSubmit={handleSearchPlate} className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ex: BRA2E19 ou MER8I90"
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 font-mono text-sm tracking-wider uppercase text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={searchingPlate || !plateInput}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-sm transition-all"
              >
                {searchingPlate ? 'Buscando...' : 'Consultar Placa'}
              </button>
            </form>

            {searchError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {searchError}
              </div>
            )}

            {vehicle && (
              <div className="mt-4 p-4 rounded-lg bg-slate-900/90 border border-emerald-500/30 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block">Veículo Confirmado</span>
                  <div className="font-bold text-white text-base">
                    {vehicle.brand} {vehicle.model} ({vehicle.year})
                  </div>
                  <div className="text-xs text-amber-400 font-mono mt-0.5">
                    Placa: {vehicle.licensePlate} • {vehicle.currentKm ? `${vehicle.currentKm} km` : 'Km não informada'}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Proprietário</span>
                  <div className="font-bold text-white text-base">{vehicle.client.name}</div>
                  <div className="text-xs text-slate-400">
                    Tel: {vehicle.client.phone} • Doc: {vehicle.client.document}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Etapa 2: Queixa do Cliente */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-amber-500" />
              2. Queixa / Relato do Cliente
            </h2>
            <textarea
              rows={3}
              placeholder="Descreva o que o cliente relatou (ex: barulho ao frear, luz da injeção acesa, revisão preventiva...)"
              value={reportedIssue}
              onChange={(e) => setReportedIssue(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Etapa 3: Itens da OS */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-500" />
                3. Serviços e Peças do Orçamento
              </h2>
            </div>

            {/* Adicionador Rápido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Adicionar Serviço:</label>
                <select
                  onChange={(e) => {
                    const srv = availableServices.find((s) => s.id === e.target.value);
                    if (srv) handleAddService(srv.name, srv.price, srv.id);
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
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
                <label className="text-xs text-slate-400 block mb-1">Adicionar Peça / Produto:</label>
                <select
                  onChange={(e) => {
                    const prod = availableProducts.find((p) => p.id === e.target.value);
                    if (prod) handleAddProduct(prod.name, prod.price, prod.id);
                    e.target.value = '';
                  }}
                  defaultValue=""
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
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
              <div className="p-8 text-center text-slate-500 border border-dashed border-slate-700 rounded-lg text-sm">
                Nenhum serviço ou peça inserido. Selecione nos campos acima.
              </div>
            ) : (
              <div className="divide-y divide-slate-700/60 border border-slate-700/60 rounded-lg overflow-hidden">
                {items.map((it, idx) => (
                  <div key={it.id} className="p-3 bg-slate-900/50 flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          it.itemType === 'SERVICE' ? 'bg-sky-500/20 text-sky-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {it.itemType === 'SERVICE' ? 'Serviço' : 'Peça'}
                        </span>
                        <span className="font-medium text-white">{it.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        R$ {it.unitPrice.toFixed(2)} un.
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-md px-2 py-1">
                        <span className="text-xs text-slate-400">Qtd:</span>
                        <input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) => handleUpdateQuantity(idx, parseInt(e.target.value) || 1)}
                          className="w-12 bg-transparent text-center text-white text-sm focus:outline-none"
                        />
                      </div>

                      <div className="w-24 text-right font-semibold text-white">
                        R$ {(it.unitPrice * it.quantity).toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-400 hover:text-red-300 p-1.5 transition-colors"
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
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-sm sticky top-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Resumo do Orçamento
            </h2>

            <div className="space-y-3 text-sm border-b border-slate-700 pb-4 mb-4">
              <div className="flex justify-between text-slate-400">
                <span>Total em Serviços:</span>
                <span className="font-medium text-slate-200">R$ {totalServices.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total em Peças/Materiais:</span>
                <span className="font-medium text-slate-200">R$ {totalProducts.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline mb-6">
              <span className="text-base font-bold text-white">Valor Total da OS:</span>
              <span className="text-2xl font-extrabold text-emerald-400">
                R$ {finalTotal.toFixed(2)}
              </span>
            </div>

            {submitError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {submitError}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={submitting || !vehicle || items.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {submitting ? (
                'Gerando Ordem de Serviço...'
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Abrir Ordem de Serviço
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-500 text-center mt-3">
              A OS será criada inicialmente como Orçamento (`QUOTE`) aguardando aprovação do cliente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
