'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { API_BASE_URL } from '@/services/api-base';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, WifiOff, X, XCircle } from 'lucide-react';

// ==========================================
// TOASTS (sucesso/erro das operações)
// ==========================================

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

let toasts: ToastItem[] = [];
let nextId = 1;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

function push(kind: ToastKind, text: string) {
  // Evita empilhar a mesma mensagem repetida
  if (toasts.some((t) => t.text === text && t.kind === kind)) return;
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, kind, text }];
  emitToasts();
  setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3500);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export const toast = {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text),
  info: (text: string) => push('info', text),
};

const TOAST_STYLE: Record<ToastKind, { cls: string; Icon: typeof CheckCircle2 }> = {
  success: { cls: 'border-emerald-500/40 text-emerald-200', Icon: CheckCircle2 },
  error: { cls: 'border-rose-500/40 text-rose-200', Icon: XCircle },
  info: { cls: 'border-sky-500/40 text-sky-200', Icon: Info },
};

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div
      aria-live="polite"
      className="fixed z-[90] inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-auto lg:bottom-4 lg:right-4 lg:left-auto flex flex-col items-center lg:items-end gap-2 px-4 pointer-events-none"
    >
      {items.map((t) => {
        const { cls, Icon } = TOAST_STYLE[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full max-w-sm flex items-start gap-2.5 bg-slate-900/95 backdrop-blur border ${cls} rounded-xl px-3.5 py-3 shadow-2xl text-sm`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-px" />
            <span className="flex-1 min-w-0 break-words">{t.text}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 text-slate-400 hover:text-white" aria-label="Fechar aviso">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// CONEXÃO COM A API (banner de desconexão)
// ==========================================

let apiOnline = true;
const connListeners = new Set<() => void>();

/** Chamado pelo fetchApi: falha de rede/5xx de indisponibilidade → offline; resposta ok → online. */
export function setApiOnline(online: boolean) {
  if (apiOnline === online) return;
  apiOnline = online;
  connListeners.forEach((l) => l());
}

function useApiOnline() {
  return useSyncExternalStore(
    (l) => {
      connListeners.add(l);
      return () => connListeners.delete(l);
    },
    () => apiOnline,
    () => true,
  );
}

async function probeHealth(base: string) {
  try {
    const r = await fetch(`${base}/health`, { cache: 'no-store' });
    setApiOnline(r.ok);
  } catch {
    setApiOnline(false);
  }
}

/**
 * Faixa fixa e discreta quando a API está fora do ar. Não desmonta a tela: o usuário continua vendo
 * o que já carregou. Testa /api/health a cada 10 s e some sozinha quando a conexão volta.
 */
export function ConnectionBanner() {
  const apiBase = API_BASE_URL;
  const online = useApiOnline();

  useEffect(() => {
    const goOffline = () => setApiOnline(false);
    const goOnline = () => probeHealth(apiBase);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [apiBase]);

  useEffect(() => {
    if (online) return;
    const t = setInterval(() => probeHealth(apiBase), 10000);
    return () => clearInterval(t);
  }, [online, apiBase]);

  if (online) return null;
  return (
    <div
      role="alert"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-16 z-40 bg-amber-500/15 border-b border-amber-500/40 text-amber-100 text-xs sm:text-sm"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0 text-amber-300" />
        <span className="flex-1 min-w-0">Sem conexão com o servidor. Seus dados na tela continuam aqui; tentando reconectar…</span>
        <button
          onClick={() => probeHealth(apiBase)}
          className="shrink-0 inline-flex items-center gap-1 font-semibold text-amber-300 hover:text-white"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar agora
        </button>
      </div>
    </div>
  );
}

// ==========================================
// CARREGAMENTO E ERRO
// ==========================================

/** Bloco cinza animado (skeleton). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-800/80 ${className}`} aria-hidden />;
}

/** Lista de cartões em carregamento (mesmo formato no celular e no desktop). */
export function ListSkeleton({ rows = 5, label = 'Carregando...' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-2/3" />
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Erro de carregamento com botão de nova tentativa. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 sm:p-8 text-center space-y-3">
      <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
      <p className="text-sm text-slate-300">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white"
      >
        <RefreshCw className="w-4 h-4" />
        Tentar novamente
      </button>
    </div>
  );
}
