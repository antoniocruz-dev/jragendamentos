'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Wrench, 
  Car, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  QrCode,
  Search,
  Plus
} from 'lucide-react';
import { fetchApi } from '@/services/api';

interface WorkOrderSummary {
  id: string;
  code: number;
  status: string;
  finalAmount: string;
  createdAt: string;
  client: { name: string; phone: string };
  vehicle: { licensePlate: string; model: string };
}

export default function DashboardPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPlate, setFilterPlate] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<WorkOrderSummary[]>('/work-orders');
      setWorkOrders(data);
    } catch (err: any) {
      console.error('Erro ao carregar Ordens de Serviço:', err);
      setError(err?.message || 'Falha ao conectar com o backend.');
    } finally {
      setLoading(false);
    }
  }

  // Métricas rápidas calculadas do estado atual
  const totalBilled = workOrders
    .filter((wo) => wo.status === 'BILLED')
    .reduce((acc, wo) => acc + Number(wo.finalAmount), 0);

  const inProgressCount = workOrders.filter(
    (wo) => wo.status === 'IN_PROGRESS' || wo.status === 'APPROVED'
  ).length;

  const quoteCount = workOrders.filter((wo) => wo.status === 'QUOTE').length;

  const filteredOrders = workOrders.filter((wo) =>
    wo.vehicle.licensePlate.toLowerCase().includes(filterPlate.toLowerCase()) ||
    wo.client.name.toLowerCase().includes(filterPlate.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wrench className="w-8 h-8 text-amber-500" />
            JR Agendamentos
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Painel Operacional da Oficina Mecânica
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/work-orders/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nova Ordem de Serviço
          </Link>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Oficina Conectada
          </span>
        </div>
      </header>

      {/* Cards de Métricas */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Carros no Pátio / Em Serviço</span>
            <Car className="w-5 h-5 text-sky-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{inProgressCount}</div>
          <p className="text-xs text-slate-400 mt-1">Autorizados ou em execução</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Orçamentos Aguardando</span>
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{quoteCount}</div>
          <p className="text-xs text-slate-400 mt-1">Pendentes de aprovação pelo cliente</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-sm font-medium">Faturamento Concluído</span>
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">
            R$ {totalBilled.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-1">OSs quitadas e baixadas</p>
        </div>
      </section>

      {/* Tabela de Ordens de Serviço */}
      <section className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Ordens de Serviço Ativas</h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por placa ou cliente..."
              value={filterPlate}
              onChange={(e) => setFilterPlate(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 text-sm rounded-lg pl-9 pr-4 py-2 text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Carregando dados da oficina...</div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 text-red-400 mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-white font-medium mb-1">Não foi possível carregar os dados</div>
            <div className="text-slate-400 text-sm max-w-md mx-auto mb-4">{error}</div>
            <button
              onClick={loadOrders}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-xs rounded-lg transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400">Nenhuma ordem de serviço encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="py-3 px-4">OS #</th>
                  <th className="py-3 px-4">Placa / Veículo</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Valor Total</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredOrders.map((wo) => (
                  <tr key={wo.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                      #{wo.code}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white uppercase">{wo.vehicle.licensePlate}</div>
                      <div className="text-xs text-slate-400">{wo.vehicle.model}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-white font-medium">{wo.client.name}</div>
                      <div className="text-xs text-slate-400">{wo.client.phone}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        wo.status === 'BILLED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : wo.status === 'QUOTE'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                      }`}>
                        {wo.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      R$ {Number(wo.finalAmount).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <a
                        href={`/os/${wo.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 hover:underline"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Ver / Cobrar
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
