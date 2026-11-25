'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

/** Peças de interface reutilizadas pelas telas de cadastro (modal, campos, botões). */

export const inputCls =
  'w-full bg-surface-offwhite border border-line rounded-lg px-3 py-2 text-sm text-brand-brown-dark placeholder-brand-brown-light focus:outline-none focus:border-neon-deep disabled:opacity-60';

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.';
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-surface-white border border-line rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0`}
      >
        <div className="sticky top-0 z-10 bg-surface-white flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-line-soft">
          <h2 className="text-base sm:text-lg font-bold text-brand-brown-dark truncate">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 -mr-1.5 text-brand-brown hover:text-brand-brown-dark" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-semibold text-brand-brown">{label}</span>
      {children}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-sm text-rose-700 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{message}</div>;
}

export function ModalActions({ onCancel, saving, label = 'Salvar' }: { onCancel: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2.5 sm:py-2 text-sm font-semibold text-brand-brown hover:text-brand-brown-dark">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2.5 sm:py-2 text-sm font-bold rounded-lg bg-neon-primary hover:bg-neon-soft text-brand-brown-dark disabled:opacity-60"
      >
        {saving ? 'Salvando...' : label}
      </button>
    </div>
  );
}

type Tone = 'neutral' | 'danger' | 'warning' | 'success';
const TONES: Record<Tone, string> = {
  neutral: 'text-brand-brown hover:text-brand-brown-dark hover:bg-surface-muted border-line',
  danger: 'text-rose-700 hover:text-brand-brown-dark hover:bg-rose-500/20 border-rose-500/30',
  warning: 'text-brand-brown hover:text-brand-brown-dark hover:bg-neon-primary/20 border-neon-deep/30',
  success: 'text-emerald-700 hover:text-brand-brown-dark hover:bg-emerald-500/20 border-emerald-500/30',
};

export function ActionBtn({
  icon: Icon,
  label,
  onClick,
  tone = 'neutral',
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center justify-center gap-1 min-w-8 min-h-8 sm:min-h-0 px-2 py-1 rounded-md border text-xs font-semibold transition-colors disabled:opacity-50 ${TONES[tone]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ==========================================
// LAYOUT PADRÃO DAS TELAS (mobile first)
// ==========================================

/** Contêiner padrão: margens menores no celular, largura máxima no desktop. */
export function PageShell({ children, width = 'max-w-7xl' }: { children: React.ReactNode; width?: string }) {
  return (
    <div className="min-h-full bg-surface-offwhite text-brand-brown-dark px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className={`${width} mx-auto space-y-5 sm:space-y-6`}>{children}</div>
    </div>
  );
}

/** Cabeçalho padrão: título + descrição; ações ficam embaixo no celular e à direita no desktop. */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 border-b border-line-soft pb-4 sm:pb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-brown-dark flex items-center gap-2.5">
          <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-neon-deep shrink-0" />
          <span className="min-w-0">{title}</span>
        </h1>
        {description && <p className="text-xs sm:text-sm text-brand-brown mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </header>
  );
}

/** Botão primário padrão (também usado como Link via className). */
export const primaryBtnCls =
  'inline-flex items-center justify-center gap-2 bg-neon-primary hover:bg-neon-soft text-brand-brown-dark font-bold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-neon-primary/20 disabled:opacity-60';

/** Atrasa o valor (ex.: busca digitada) para não disparar uma consulta por tecla. */
export function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-brown pointer-events-none" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-9 py-2.5`}
      />
    </div>
  );
}

/** Resposta paginada da API (espelho de src/common/pagination.ts). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPage,
  loading,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  loading?: boolean;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    'inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-lg border border-line text-sm font-semibold text-brand-brown hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center justify-between gap-3 text-xs sm:text-sm text-brand-brown">
      <span>
        {from}–{to} de <strong className="text-brand-brown-dark">{total}</strong>
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} aria-label="Página anterior">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>
          <span className="tabular-nums">
            {page}/{pages}
          </span>
          <button type="button" className={btn} disabled={page >= pages || loading} onClick={() => onPage(page + 1)} aria-label="Próxima página">
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
