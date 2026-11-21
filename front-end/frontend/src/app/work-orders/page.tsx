'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ClipboardList, 
  Search, 
  Play, 
  CheckCircle, 
  Share2, 
  Eye, 
  PlusCircle, 
  Wrench,
  Clock,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { fetchApi } from '@/services/api';

// Dicionário de tradução semântica dos status para PT-BR
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  ALL: { label: 'Todos os Status', bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' },
  QUOTE: { label: 'Orçamento', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  APPROVED: { label: 'Aprovado', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  IN_PROGRESS: { label: 'Em Execução', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  COMPLETED: { label: 'Finalizado', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  BILLED: { label: 'Pago e Faturado', bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/50' },
  CANCELED: { label: 'Cancelado', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
};

interface WorkOrder {
  id: string;
  code: number;
  status: string;
  reportedIssue?: string;
  finalAmount: string | number;
  createdAt: string;
  client: { name: string; phone: string };
  vehicle: { licensePlate: string; brand: string; model: string; year: number };
}

export default function WorkOrdersGeneralPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadWorkOrders();
  }, []);

  async function loadWorkOrders() {
    try {
      setLoading(true);
      const data = await fetchApi<WorkOrder[]>('/work-orders');
      setWorkOrders(data);
    } catch (err: any) {
      console.error('Erro ao carregar Ordens de Serviço:', err);
    } finally {
      setLoading(false);
    }
  }

  // Avanço rápido de status pelo mecânico/atendente
  async function handleAdvanceStatus(workOrderId: string, nextStatus: 'IN_PROGRESS' | 'COMPLETED') {
    const statusLabel = nextStatus === 'IN_PROGRESS' ? 'Em Execução' : 'Finalizado';
    if (!confirm(`Deseja alterar o status desta OS para "${statusLabel}"?`)) return;

    try {
      setActionLoadingId(workOrderId);
      await fetchApi(`/work-orders/${workOrderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadWorkOrders();
    } catch (err: any) {
      alert(`Erro ao atualizar status: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  // Disparo de mensagem pronta e link direto no WhatsApp do cliente
  function handleSendWhatsApp(wo: WorkOrder) {
    const cleanPhone = wo.client.phone.replace(/\D/g, '');
    const phoneWithDDI = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
    const osLink = `${origin}/os/${wo.id}`;

    const message = encodeURIComponent(
      `Olá, *${wo.client.name}*!\n\n` +
      `Aqui é da oficina *JR Agendamentos*.\n` +
      `Sua Ordem de Serviço *#${wo.code}* para o veículo *${wo.vehicle.brand} ${wo.vehicle.model} (${wo.vehicle.licensePlate})* já está disponível.\n\n` +
      `Acesse o link abaixo para visualizar a discriminação de serviços e peças, aprovar o orçamento ou efetuar o pagamento via Pix:\n` +
      `👉 ${osLink}\n\n` +
      `Qualquer dúvida estamos à disposição!`
    );

    const waHost = ['https://', 'wa', '.me/'].join('');
    const whatsappUrl = `${waHost}${phoneWithDDI}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  }

  // Filtros combinados (por status e por texto de busca)
  const filteredOrders = workOrders.filter((wo) => {
    const matchesStatus = statusFilter === 'ALL' || wo.status === statusFilter;
    const matchesSearch = 
      wo.vehicle.licensePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.code.toString().includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabeçalho da Página */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-amber-500" />
              Painel Geral de Ordens de Serviço
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Acompanhe o fluxo operacional, autorizações de clientes e liberação de veículos da oficina.
            </p>
          </div>
          
          <Link
            href="/work-orders/new"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-3 rounded-xl transition-all shadow-md shadow-amber-500/20 text-sm"
          >
            <PlusCircle className="w-5 h-5" />
            Nova Ordem de Serviço
          </Link>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-center justify-between gap-4">
          
          {/* Abas Rápidas por Status */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0 scrollbar-thin">
            {Object.keys(STATUS_CONFIG).map((statusKey) => {
              const cfg = STATUS_CONFIG[statusKey];
              const isSelected = statusFilter === statusKey;
              return (
                <button
                  key={statusKey}
                  onClick={() => setStatusFilter(statusKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Campo de Pesquisa */}
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por placa, cliente ou nº da OS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Tabela Operacional de Ordens de Serviço */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <Wrench className="w-8 h-8 text-amber-500 animate-spin" />
              <span>Carregando Ordens de Serviço da oficina...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <ClipboardList className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-300">Nenhuma Ordem de Serviço encontrada</p>
              <p className="text-xs text-slate-500 mt-1">Ajuste os filtros de status ou crie uma nova OS no balcão.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs uppercase font-bold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-4 px-5">OS #</th>
                    <th className="py-4 px-5">Veículo / Placa</th>
                    <th className="py-4 px-5">Cliente</th>
                    <th className="py-4 px-5">Status Atual</th>
                    <th className="py-4 px-5">Valor Total</th>
                    <th className="py-4 px-5 text-center">Ações Operacionais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredOrders.map((wo) => {
                    const statusInfo = STATUS_CONFIG[wo.status] || {
                      label: wo.status,
                      bg: 'bg-slate-800',
                      text: 'text-slate-300',
                      border: 'border-slate-700',
                    };
                    const isAdvancing = actionLoadingId === wo.id;

                    return (
                      <tr key={wo.id} className="hover:bg-slate-800/40 transition-colors">
                        
                        {/* Código da OS */}
                        <td className="py-4 px-5 font-mono font-bold text-amber-400">
                          #{wo.code}
                        </td>

                        {/* Veículo e Placa */}
                        <td className="py-4 px-5">
                          <div className="font-bold text-white uppercase tracking-wide">
                            {wo.vehicle.licensePlate}
                          </div>
                          <div className="text-xs text-slate-400">
                            {wo.vehicle.brand} {wo.vehicle.model} ({wo.vehicle.year})
                          </div>
                        </td>

                        {/* Cliente */}
                        <td className="py-4 px-5">
                          <div className="font-medium text-white">{wo.client.name}</div>
                          <div className="text-xs text-slate-400">{wo.client.phone}</div>
                        </td>

                        {/* Badge de Status em Português */}
                        <td className="py-4 px-5">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                            {statusInfo.label}
                          </span>
                        </td>

                        {/* Valor Total */}
                        <td className="py-4 px-5 font-bold text-white whitespace-nowrap">
                          R$ {Number(wo.finalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Botões Operacionais de Ação */}
                        <td className="py-4 px-5">
                          <div className="flex items-center justify-center gap-2">
                            
                            {/* 1. Botão de Avanço Rápido: Se APROVADO -> Iniciar Execução */}
                            {wo.status === 'APPROVED' && (
                              <button
                                onClick={() => handleAdvanceStatus(wo.id, 'IN_PROGRESS')}
                                disabled={isAdvancing}
                                title="Iniciar Serviço no Box/Elevador"
                                className="inline-flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                <Play className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
                                Iniciar Serviço
                              </button>
                            )}

                            {/* 2. Botão de Avanço Rápido: Se EM EXECUÇÃO -> Concluir/Finalizar */}
                            {wo.status === 'IN_PROGRESS' && (
                              <button
                                onClick={() => handleAdvanceStatus(wo.id, 'COMPLETED')}
                                disabled={isAdvancing}
                                title="Finalizar Serviço da Oficina"
                                className="inline-flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                Finalizar
                              </button>
                            )}

                            {/* 3. Botão Compartilhar no WhatsApp */}
                            <button
                              onClick={() => handleSendWhatsApp(wo)}
                              title="Enviar link da OS pelo WhatsApp"
                              className="inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              WhatsApp
                            </button>

                            {/* 4. Link Visualizar / Tela do Cliente */}
                            <Link
                              href={`/os/${wo.id}`}
                              title="Visualizar OS detalhada e cobrança Pix"
                              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-400" />
                              Ver OS
                            </Link>

                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
