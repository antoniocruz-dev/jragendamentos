'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Search, 
  Plus, 
  Car, 
  Phone, 
  FileText, 
  Wrench, 
  History, 
  ChevronRight, 
  X, 
  CheckCircle2, 
  Gauge, 
  Calendar,
  DollarSign
} from 'lucide-react';
import { fetchApi } from '@/services/api';

interface WorkOrderSummary {
  id: string;
  code: number;
  status: string;
  finalAmount: string | number;
  createdAt: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  currentKm?: number;
  workOrders?: WorkOrderSummary[];
}

interface Client {
  id: string;
  name: string;
  document: string;
  phone: string;
  email?: string;
  vehicles: Vehicle[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  QUOTE: { label: 'Orçamento', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  APPROVED: { label: 'Aprovado', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  IN_PROGRESS: { label: 'Em Execução', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  COMPLETED: { label: 'Finalizado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  BILLED: { label: 'Pago', color: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/50' },
  CANCELED: { label: 'Cancelado', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modais
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  // Estado selecionado para veículo ou histórico
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Formulário Novo Cliente + Primeiro Veículo
  const [clientForm, setClientForm] = useState({
    name: '',
    document: '',
    phone: '',
    email: '',
    brand: '',
    model: '',
    year: '',
    licensePlate: '',
    currentKm: '',
  });

  // Formulário Novo Veículo (para cliente existente)
  const [vehicleForm, setVehicleForm] = useState({
    brand: '',
    model: '',
    year: '',
    licensePlate: '',
    currentKm: '',
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      setLoading(true);
      const data = await fetchApi<Client[]>('/clients');
      setClients(data);
    } catch (err: any) {
      console.error('Erro ao carregar clientes:', err);
    } finally {
      setLoading(false);
    }
  }

  // Cadastro de Novo Cliente com Veículo opcional
  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!clientForm.name || !clientForm.document || !clientForm.phone) {
      alert('Preencha os campos obrigatórios do cliente (Nome, CPF/CNPJ e Telefone).');
      return;
    }

    try {
      setSaving(true);
      const hasVehicle = clientForm.licensePlate.trim() !== '';
      const payload: any = {
        name: clientForm.name,
        document: clientForm.document,
        phone: clientForm.phone,
        email: clientForm.email || undefined,
      };

      if (hasVehicle) {
        payload.vehicle = {
          brand: clientForm.brand,
          model: clientForm.model,
          year: Number(clientForm.year) || new Date().getFullYear(),
          licensePlate: clientForm.licensePlate.toUpperCase().trim(),
          currentKm: clientForm.currentKm ? Number(clientForm.currentKm) : undefined,
        };
      }

      await fetchApi('/clients', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      alert('Cliente cadastrado com sucesso!');
      setIsClientModalOpen(false);
      setClientForm({
        name: '',
        document: '',
        phone: '',
        email: '',
        brand: '',
        model: '',
        year: '',
        licensePlate: '',
        currentKm: '',
      });
      await loadClients();
    } catch (err: any) {
      alert(`Erro ao cadastrar cliente: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // Cadastro de Novo Veículo para Cliente Existente
  async function handleCreateVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient || !vehicleForm.licensePlate) {
      alert('Informe ao menos a placa do veículo.');
      return;
    }

    try {
      setSaving(true);
      await fetchApi(`/clients/${selectedClient.id}/vehicles`, {
        method: 'POST',
        body: JSON.stringify({
          brand: vehicleForm.brand,
          model: vehicleForm.model,
          year: Number(vehicleForm.year) || new Date().getFullYear(),
          licensePlate: vehicleForm.licensePlate.toUpperCase().trim(),
          currentKm: vehicleForm.currentKm ? Number(vehicleForm.currentKm) : undefined,
        }),
      });

      alert(`Veículo adicionado para ${selectedClient.name}!`);
      setIsVehicleModalOpen(false);
      setVehicleForm({ brand: '', model: '', year: '', licensePlate: '', currentKm: '' });
      await loadClients();
    } catch (err: any) {
      alert(`Erro ao adicionar veículo: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // Abre o modal de histórico de OSs do veículo
  function handleOpenHistory(vehicle: Vehicle, client: Client) {
    setSelectedVehicle(vehicle);
    setSelectedClient(client);
    setIsHistoryModalOpen(true);
  }

  // Abre o modal para adicionar outro carro a um cliente
  function handleOpenAddVehicle(client: Client) {
    setSelectedClient(client);
    setIsVehicleModalOpen(true);
  }

  // Busca rápida (Nome, CPF/CNPJ, Telefone ou Placa de qualquer veículo vinculado)
  const filteredClients = clients.filter((client) => {
    const term = searchTerm.toLowerCase();
    const matchClient = 
      client.name.toLowerCase().includes(term) ||
      client.document.toLowerCase().includes(term) ||
      client.phone.includes(term);

    const matchVehicle = client.vehicles?.some((v) => 
      v.licensePlate.toLowerCase().includes(term) ||
      v.model.toLowerCase().includes(term) ||
      v.brand.toLowerCase().includes(term)
    );

    return matchClient || matchVehicle;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-amber-500" />
              Gestão de Clientes e Veículos
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Cadastre proprietários, gerencie a frota atendida e consulte o histórico de manutenções de cada veículo.
            </p>
          </div>
          
          <button
            onClick={() => setIsClientModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-amber-500/20 text-sm"
          >
            <Plus className="w-5 h-5" />
            Cadastrar Novo Cliente
          </button>
        </div>

        {/* Barra de Pesquisa Rápida */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center justify-between">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar rapidamente por nome, CPF/CNPJ, telefone ou placa do carro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Listagem de Clientes */}
        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <Wrench className="w-8 h-8 text-amber-500 animate-spin" />
            <span>Carregando clientes e frotas cadastradas...</span>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center text-slate-400">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-300">Nenhum cliente ou veículo localizado</p>
            <p className="text-xs text-slate-500 mt-1">Clique no botão acima para realizar o primeiro cadastro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredClients.map((client) => (
              <div 
                key={client.id}
                className="bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-5 transition-all shadow-md"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  {/* Dados do Cliente */}
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold text-white">{client.name}</h2>
                      <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                        {client.document}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-1.5">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-amber-500" />
                        {client.phone}
                      </span>
                      {client.email && (
                        <span>• {client.email}</span>
                      )}
                      <span className="text-slate-500">
                        • {client.vehicles?.length || 0} veículo(s) cadastrado(s)
                      </span>
                    </div>
                  </div>

                  {/* Ações do Cliente */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenAddVehicle(client)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl border border-slate-700/80 transition-colors"
                    >
                      <Car className="w-3.5 h-3.5 text-sky-400" />
                      Adicionar Veículo
                    </button>
                    <Link
                      href={`/work-orders/new`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-2 rounded-xl border border-amber-500/30 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Nova OS
                    </Link>
                  </div>
                </div>

                {/* Veículos Vinculados */}
                <div className="mt-4">
                  <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider block mb-2.5">
                    Veículos Vinculados
                  </span>
                  
                  {(!client.vehicles || client.vehicles.length === 0) ? (
                    <p className="text-xs text-slate-500 italic">
                      Nenhum veículo registrado para este cliente ainda.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {client.vehicles.map((v) => {
                        return (
                          <div 
                            key={v.id}
                            className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700 transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white uppercase text-sm">
                                  {v.licensePlate}
                                </span>
                                <span className="text-xs text-slate-400">
                                  ({v.year})
                                </span>
                              </div>
                              <p className="text-xs text-slate-300 font-medium mt-0.5">
                                {v.brand} {v.model}
                              </p>
                              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1.5">
                                <span className="flex items-center gap-1">
                                  <Gauge className="w-3 h-3 text-slate-400" />
                                  {v.currentKm ? `${v.currentKm.toLocaleString('pt-BR')} km` : 'Km não informada'}
                                </span>
                              </div>
                            </div>

                            {/* Botão para Ver Histórico de OSs */}
                            <button
                              onClick={() => handleOpenHistory(v, client)}
                              title="Visualizar histórico completo de manutenções"
                              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 rounded-lg border border-slate-800 transition-colors"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* MODAL 1: Cadastro de Cliente + Veículo */}
      {isClientModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                Cadastrar Novo Cliente
              </h2>
              <button 
                onClick={() => setIsClientModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              {/* Dados Pessoais */}
              <div>
                <h3 className="text-xs uppercase font-bold text-amber-500 tracking-wider mb-2">
                  Dados do Proprietário
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João da Silva"
                      value={clientForm.name}
                      onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">CPF ou CNPJ *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 000.000.000-00"
                      value={clientForm.document}
                      onChange={(e) => setClientForm({ ...clientForm, document: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Telefone / WhatsApp *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: (85) 99999-9999"
                      value={clientForm.phone}
                      onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">E-mail (opcional)</label>
                    <input
                      type="email"
                      placeholder="Ex: cliente@email.com"
                      value={clientForm.email}
                      onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Primeiro Veículo */}
              <div className="pt-2 border-t border-slate-800">
                <h3 className="text-xs uppercase font-bold text-sky-400 tracking-wider mb-2">
                  Primeiro Veículo (Opcional)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Placa</label>
                    <input
                      type="text"
                      placeholder="Ex: BRA2E19"
                      value={clientForm.licensePlate}
                      onChange={(e) => setClientForm({ ...clientForm, licensePlate: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Marca</label>
                    <input
                      type="text"
                      placeholder="Ex: Toyota"
                      value={clientForm.brand}
                      onChange={(e) => setClientForm({ ...clientForm, brand: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Modelo</label>
                    <input
                      type="text"
                      placeholder="Ex: Corolla XEi"
                      value={clientForm.model}
                      onChange={(e) => setClientForm({ ...clientForm, model: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Ano</label>
                    <input
                      type="number"
                      placeholder="Ex: 2022"
                      value={clientForm.year}
                      onChange={(e) => setClientForm({ ...clientForm, year: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Km Atual</label>
                    <input
                      type="number"
                      placeholder="Ex: 45000"
                      value={clientForm.currentKm}
                      onChange={(e) => setClientForm({ ...clientForm, currentKm: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Salvando...' : 'Salvar Cadastro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Adicionar Veículo para Cliente Existente */}
      {isVehicleModalOpen && selectedClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Car className="w-5 h-5 text-sky-400" />
                  Adicionar Veículo
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Proprietário: {selectedClient.name}</p>
              </div>
              <button 
                onClick={() => setIsVehicleModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVehicle} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Placa do Veículo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: RGE3F44"
                    value={vehicleForm.licensePlate}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Marca *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Jeep"
                    value={vehicleForm.brand}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Modelo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Renegade Longitude"
                    value={vehicleForm.model}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Ano</label>
                  <input
                    type="number"
                    placeholder="Ex: 2023"
                    value={vehicleForm.year}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Km Atual</label>
                  <input
                    type="number"
                    placeholder="Ex: 32000"
                    value={vehicleForm.currentKm}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, currentKm: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsVehicleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Adicionando...' : 'Adicionar Veículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Histórico de Manutenções e OSs do Veículo */}
      {isHistoryModalOpen && selectedVehicle && selectedClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-500" />
                  Histórico de Manutenções
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedVehicle.brand} {selectedVehicle.model} ({selectedVehicle.licensePlate}) • Cliente: {selectedClient.name}
                </p>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista das OSs deste veículo */}
            {(!selectedVehicle.workOrders || selectedVehicle.workOrders.length === 0) ? (
              <div className="py-12 text-center text-slate-500">
                <Wrench className="w-10 h-10 mx-auto text-slate-600 mb-2 opacity-50" />
                <p className="text-sm font-semibold text-slate-400">Nenhuma Ordem de Serviço encontrada para este carro.</p>
                <p className="text-xs text-slate-600 mt-1">Este veículo ainda não passou por manutenção no sistema.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto pr-1">
                {selectedVehicle.workOrders.map((wo) => {
                  const statusInfo = STATUS_LABELS[wo.status] || {
                    label: wo.status,
                    color: 'text-slate-300 bg-slate-800 border-slate-700',
                  };
                  const dateFormatted = new Date(wo.createdAt).toLocaleDateString('pt-BR');

                  return (
                    <div key={wo.id} className="py-3.5 flex items-center justify-between text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400">
                            OS #{wo.code}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          Realizada em: {dateFormatted}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-bold text-white">
                          R$ {Number(wo.finalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <Link
                          href={`/os/${wo.id}`}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs"
                          title="Abrir Ordem de Serviço detalhada"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
              <Link
                href="/work-orders/new"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:text-amber-400"
              >
                <Plus className="w-4 h-4" />
                Abrir Nova OS para este Veículo
              </Link>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
