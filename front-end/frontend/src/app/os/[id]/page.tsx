'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Wrench,
  Car,
  User,
  ArrowLeft,
  DollarSign,
  Package,
  FileText,
  QrCode,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  Pause,
  ExternalLink,
  ShieldCheck,
  Loader2,
  XCircle,
  Wallet,
} from 'lucide-react';
import { Field, FormError, Modal, ModalActions, errorMessage as errMsg, inputCls } from '@/components/crud';
import { PAYMENT_OPTIONS, brl, type StaffOption } from '@/services/financial';
import { fetchApi } from '@/services/api';
import { useAuth } from '@/services/auth';

interface WorkOrderDetail {
  id: string;
  code: number;
  status: string;
  finalAmount: string;
  totalServices: string;
  totalProducts: string;
  discount: string;
  reportedIssue?: string;
  technicalNotes?: string;
  createdAt: string;
  finishedAt?: string;
  operator?: { id: string; name: string } | null;
  client: {
    id: string;
    name: string;
    phone: string;
    document: string;
    email?: string;
  };
  vehicle: {
    id: string;
    licensePlate: string;
    brand: string;
    model: string;
    year: number;
    currentKm?: number;
    color?: string;
  };
  items: Array<{
    id: string;
    itemType: 'SERVICE' | 'PRODUCT';
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    service?: { id: string; name: string };
    product?: { id: string; name: string; sku: string };
  }>;
  transactions?: Array<{
    id: string;
    amount: string;
    status: string;
    paymentMethod: string;
    paidAt?: string;
  }>;
}

interface PixData {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}

export default function WorkOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const osId = params?.id as string;
  // Botões de andamento da oficina só aparecem para a equipe logada;
  // o cliente (sem login) só aprova/recusa o orçamento e paga.
  const { isAuthenticated: isStaff, user } = useAuth();
  const canBill = isStaff && !!user?.modules?.some((m) => m === 'WORK_ORDERS' || m === 'FINANCIAL');
  const [billingOpen, setBillingOpen] = useState(false);

  const [order, setOrder] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Ações
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados do Pix
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (osId) {
      loadOrderDetails();
    }
  }, [osId]);

  async function loadOrderDetails() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<WorkOrderDetail>(`/work-orders/${osId}`);
      setOrder(data);
    } catch (err: any) {
      console.error('Erro ao carregar OS:', err);
      setError(err?.message || 'Falha ao buscar os dados da Ordem de Serviço.');
    } finally {
      setLoading(false);
    }
  }

  // Atualização de Status da OS
  async function handleUpdateStatus(newStatus: string, reason?: string) {
    try {
      setActionLoading(true);
      setActionMessage(null);

      const updated = await fetchApi<WorkOrderDetail>(`/work-orders/${osId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          reason,
        }),
      });

      setOrder(updated);
      setActionMessage({
        type: 'success',
        text: `Status atualizado para "${newStatus}" com sucesso!`,
      });
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Erro ao atualizar status da Ordem de Serviço.',
      });
    } finally {
      setActionLoading(false);
    }
  }

  // Decisão do cliente sobre o orçamento (rota pública, só vale para OS em orçamento)
  async function handleCustomerDecision(decision: 'APPROVE' | 'REJECT', reason?: string) {
    try {
      setActionLoading(true);
      setActionMessage(null);

      const updated = await fetchApi<WorkOrderDetail>(`/work-orders/${osId}/customer-decision`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, reason }),
      });

      setOrder(updated);
      setActionMessage({
        type: 'success',
        text: decision === 'APPROVE' ? 'Orçamento aprovado com sucesso!' : 'Orçamento recusado.',
      });
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao registrar a decisão sobre o orçamento.',
      });
    } finally {
      setActionLoading(false);
    }
  }

  // Geração de Cobrança Pix via Mercado Pago
  async function handleGeneratePix() {
    try {
      setGeneratingPix(true);
      setActionMessage(null);

      const res = await fetchApi<{ pix: PixData }>('/payments/pix', {
        method: 'POST',
        body: JSON.stringify({ workOrderId: osId }),
      });

      setPixData(res.pix);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Erro ao gerar Pix no Mercado Pago.',
      });
    } finally {
      setGeneratingPix(false);
    }
  }

  // Copiar código Pix
  function handleCopyPix() {
    if (!pixData?.qrCode) return;
    navigator.clipboard.writeText(pixData.qrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'BILLED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'COMPLETED':
        return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
      case 'IN_PROGRESS':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      case 'WAITING_PARTS':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'APPROVED':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'QUOTE':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'CANCELLED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-700/30 text-slate-400 border-slate-600';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Rascunho',
      QUOTE: 'Orçamento Aberto',
      APPROVED: 'Aprovado pelo Cliente',
      IN_PROGRESS: 'Em Execução',
      WAITING_PARTS: 'Aguardando Peças',
      COMPLETED: 'Serviço Concluído',
      BILLED: 'Faturada e Paga',
      CANCELLED: 'Cancelada',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Carregando detalhes da Ordem de Serviço...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 flex flex-col items-center justify-center">
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Ordem de Serviço não encontrada</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'O ID informado não existe no sistema.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-sm"
          >
            Voltar para o Painel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* Barra de Navegação e Cabeçalho */}
      <div className="max-w-5xl mx-auto mb-5 sm:mb-8">
        {isStaff && (
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Painel Geral
          </button>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                OS #{order.code}
              </h1>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getStatusBadge(
                  order.status,
                )}`}
              >
                {getStatusLabel(order.status)}
              </span>
            </div>
            <p className="text-slate-400 mt-1 text-xs">
              Aberta em {new Date(order.createdAt).toLocaleDateString('pt-BR')} às{' '}
              {new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block">Valor Final</span>
            <span className="text-3xl font-extrabold text-emerald-400 font-mono">
              R$ {Number(order.finalAmount).toFixed(2)}
            </span>
          </div>
        </div>

        {actionMessage && (
          <div
            className={`mt-4 p-4 rounded-xl border text-sm flex items-center justify-between gap-3 ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              {actionMessage.text}
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              Fechar
            </button>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
        {/* Coluna 1 & 2: Detalhes do Veículo, Cliente, Queixas e Itens */}
        <div className="lg:col-span-2 space-y-5 sm:space-y-6">
          {/* Card: Veículo & Cliente */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 sm:p-6 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs font-semibold uppercase tracking-wider">
                <Car className="w-4 h-4 text-sky-400" />
                Veículo
              </div>
              <div className="text-lg font-bold text-white">
                {order.vehicle.brand} {order.vehicle.model}
              </div>
              <div className="text-sm text-amber-400 font-mono font-semibold mt-1">
                Placa: {order.vehicle.licensePlate} • Ano: {order.vehicle.year}
              </div>
              {order.vehicle.currentKm !== undefined && (
                <div className="text-xs text-slate-400 mt-0.5">Km Atual: {order.vehicle.currentKm} km</div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs font-semibold uppercase tracking-wider">
                <User className="w-4 h-4 text-emerald-400" />
                Cliente
              </div>
              <div className="text-lg font-bold text-white">{order.client.name}</div>
              <div className="text-sm text-slate-300 mt-1">Tel: {order.client.phone}</div>
              <div className="text-xs text-slate-400 mt-0.5">CPF/CNPJ: {order.client.document}</div>
            </div>
          </div>

          {/* Card: Relato e Notas Técnicas */}
          {(order.reportedIssue || order.technicalNotes) && (
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
              {order.reportedIssue && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400 mb-1">
                    <FileText className="w-4 h-4 text-amber-400" />
                    Relato do Cliente
                  </div>
                  <p className="text-sm text-slate-200 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    {order.reportedIssue}
                  </p>
                </div>
              )}

              {order.technicalNotes && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400 mb-1">
                    <Wrench className="w-4 h-4 text-sky-400" />
                    Diagnóstico / Notas Técnicas
                  </div>
                  <p className="text-sm text-slate-200 bg-slate-900/60 p-3 rounded-lg border border-slate-800 whitespace-pre-line">
                    {order.technicalNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Card: Tabela de Itens e Peças */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-700/80 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-500" />
                Itens e Serviços Aplicados
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Descrição</th>
                    <th className="py-3 px-4 text-center">Qtd</th>
                    <th className="py-3 px-4 text-right">Unitário</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {order.items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-700/20">
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            it.itemType === 'SERVICE'
                              ? 'bg-sky-500/20 text-sky-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {it.itemType === 'SERVICE' ? 'Serviço' : 'Peça'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-white">
                        {it.service?.name || it.product?.name || 'Item'}
                        {it.product?.sku && (
                          <span className="block text-[11px] font-mono text-slate-400">
                            SKU: {it.product.sku}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">{it.quantity}</td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        R$ {Number(it.unitPrice).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-white">
                        R$ {Number(it.totalPrice).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Coluna 3: Painel de Ações & Fluxo Financeiro */}
        <div className="space-y-6">
          {/* Card de Resumo de Valores */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Resumo Financeiro
            </h3>

            <div className="space-y-3 text-sm border-b border-slate-700 pb-4 mb-4">
              <div className="flex justify-between text-slate-300">
                <span>Serviços:</span>
                <span className="font-mono font-medium">R$ {Number(order.totalServices).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Peças e Materiais:</span>
                <span className="font-mono font-medium">R$ {Number(order.totalProducts).toFixed(2)}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Desconto:</span>
                  <span className="font-mono font-medium">- R$ {Number(order.discount).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-baseline mb-6">
              <span className="text-base font-bold text-white">Total:</span>
              <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                R$ {Number(order.finalAmount).toFixed(2)}
              </span>
            </div>

            {/* Fluxo de Ações Baseado no Status */}
            <div className="space-y-3">
              {/* Status: QUOTE -> Aprovar ou Cancelar */}
              {order.status === 'QUOTE' && (
                <>
                  <button
                    onClick={() => handleCustomerDecision('APPROVE')}
                    disabled={actionLoading}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aprovar Orçamento
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Informe o motivo da recusa (opcional):');
                      if (reason !== null) handleCustomerDecision('REJECT', reason || undefined);
                    }}
                    disabled={actionLoading}
                    className="w-full bg-slate-900 hover:bg-rose-950/40 text-rose-400 border border-rose-500/30 font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <XCircle className="w-4 h-4" />
                    Recusar / Cancelar Orçamento
                  </button>
                </>
              )}

              {/* Status: APPROVED -> Iniciar Execução */}
              {isStaff && order.status === 'APPROVED' && (
                <button
                  onClick={() => handleUpdateStatus('IN_PROGRESS')}
                  disabled={actionLoading}
                  className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <Play className="w-4 h-4" />
                  Iniciar Execução na Oficina
                </button>
              )}

              {/* Status: IN_PROGRESS -> Concluir ou Aguardar Peças */}
              {isStaff && order.status === 'IN_PROGRESS' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus('COMPLETED')}
                    disabled={actionLoading}
                    className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Concluir Serviço Mecânico
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('WAITING_PARTS')}
                    disabled={actionLoading}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-purple-300 font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <Pause className="w-4 h-4" />
                    Aguardando Peças de Fornecedor
                  </button>
                </>
              )}

              {/* Status: WAITING_PARTS -> Retomar Execução */}
              {isStaff && order.status === 'WAITING_PARTS' && (
                <button
                  onClick={() => handleUpdateStatus('IN_PROGRESS')}
                  disabled={actionLoading}
                  className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <Play className="w-4 h-4" />
                  Peças Recebidas (Retomar Execução)
                </button>
              )}

              {/* Status: COMPLETED -> equipe registra o pagamento recebido (faturamento manual) */}
              {canBill && order.status === 'COMPLETED' && (
                <button
                  onClick={() => setBillingOpen(true)}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
                >
                  <Wallet className="w-5 h-5" />
                  Registrar pagamento
                </button>
              )}

              {/* Status: COMPLETED ou APPROVED -> Opção de Gerar Cobrança Pix */}
              {(order.status === 'COMPLETED' || order.status === 'APPROVED') && !pixData && (
                <button
                  onClick={handleGeneratePix}
                  disabled={generatingPix}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                  {generatingPix ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando Pix no Mercado Pago...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-5 h-5" />
                      Gerar Pagamento Pix
                    </>
                  )}
                </button>
              )}

              {/* Status: BILLED -> Concluída e Paga */}
              {order.status === 'BILLED' && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <div className="font-bold text-emerald-400 text-sm">Ordem de Serviço Liquidada</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Pagamento confirmado e registrado no fluxo de caixa da oficina.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal / Card do Pix Ativo */}
          {pixData && order.status !== 'BILLED' && (
            <div className="bg-slate-800/90 border border-emerald-500/40 rounded-xl p-6 shadow-xl text-center space-y-4 animate-fade-in">
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm">
                <QrCode className="w-5 h-5" />
                Pagamento Pix Aberto
              </div>

              {pixData.qrCodeBase64 ? (
                <div className="inline-block p-3 bg-white rounded-xl shadow-md">
                  <img
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-slate-700/50 rounded-xl flex items-center justify-center mx-auto text-xs text-slate-400">
                  QR Code indisponível
                </div>
              )}

              <p className="text-xs text-slate-300">
                Aponte a câmera do aplicativo do banco para pagar instantaneamente.
              </p>

              {pixData.qrCode && (
                <button
                  onClick={handleCopyPix}
                  className="w-full bg-slate-900 hover:bg-slate-950 text-slate-200 border border-slate-700 text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all font-mono"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      Copiado para a área de transferência!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" />
                      Copiar Código Pix (Copia e Cola)
                    </>
                  )}
                </button>
              )}

              {pixData.ticketUrl && (
                <a
                  href={pixData.ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 hover:underline pt-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir comprovante do Mercado Pago
                </a>
              )}

              <div className="pt-2 border-t border-slate-700/60">
                <button
                  onClick={loadOrderDetails}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  🔄 Já pagou? Atualizar status agora
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {billingOpen && order && (
        <BillingModal
          order={order}
          onClose={() => setBillingOpen(false)}
          onBilled={() => {
            setBillingOpen(false);
            loadOrderDetails();
            setActionMessage({ type: 'success', text: 'Pagamento registrado. A OS foi faturada e lançada no caixa.' });
          }}
        />
      )}
    </div>
  );
}

/** Registro do pagamento (faturamento manual) de uma OS concluída. */
function BillingModal({ order, onClose, onBilled }: { order: WorkOrderDetail; onClose: () => void; onBilled: () => void }) {
  const gross = Number(order.totalServices) + Number(order.totalProducts);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [form, setForm] = useState(() => {
    const now = new Date();
    return {
      paymentMethod: 'PIX',
      installments: '1',
      // datetime-local no fuso do navegador
      paidAt: new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      discount: String(Number(order.discount) || 0),
      operatorId: order.operator?.id ?? '',
      notes: '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetchApi<StaffOption[]>('/work-orders/staff').then(setStaff).catch(() => setStaff([]));
  }, []);

  const discount = Math.round((Number(form.discount) || 0) * 100) / 100;
  const total = Math.round((gross - discount) * 100) / 100;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await fetchApi(`/work-orders/${order.id}/billing`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod: form.paymentMethod,
          installments: form.paymentMethod === 'CREDIT_CARD' ? Number(form.installments) : undefined,
          paidAt: new Date(form.paidAt).toISOString(),
          discount,
          operatorId: form.operatorId,
          notes: form.notes.trim() || undefined,
        }),
      });
      onBilled();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Registrar pagamento · OS #${order.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm bg-slate-950 border border-slate-800 rounded-lg p-3">
          <span className="text-slate-400">Peças <b className="block text-white">{brl(Number(order.totalProducts))}</b></span>
          <span className="text-slate-400">Mão de obra <b className="block text-white">{brl(Number(order.totalServices))}</b></span>
        </div>
        <Field label="Mecânico responsável (base da comissão) *">
          <select required value={form.operatorId} onChange={(e) => set('operatorId', e.target.value)} className={inputCls}>
            <option value="">Selecione...</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma de pagamento *">
            <select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} className={inputCls}>
              {PAYMENT_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          {form.paymentMethod === 'CREDIT_CARD' ? (
            <Field label="Parcelas">
              <select value={form.installments} onChange={(e) => set('installments', e.target.value)} className={inputCls}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
              </select>
            </Field>
          ) : <div />}
          <Field label="Data e hora do pagamento *">
            <input type="datetime-local" required value={form.paidAt} onChange={(e) => set('paidAt', e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </Field>
          <Field label="Desconto (R$)">
            <input type="number" min={0} max={gross} step="0.01" value={form.discount} onChange={(e) => set('discount', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Observações">
          <input value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} />
        </Field>
        <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-3">
          <span className="text-slate-400">Total a receber</span>
          <b className="text-xl text-emerald-300">{brl(total)}</b>
        </div>
        <FormError message={error} />
        <ModalActions onCancel={onClose} saving={saving} label="Confirmar pagamento" />
      </form>
    </Modal>
  );
}
