'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';

/** Peças de interface reutilizadas pelas telas de cadastro (modal, campos, botões). */

export const inputCls =
  'w-full min-h-11 bg-surface-white border border-line rounded-xl px-3 py-2 text-base sm:text-sm text-brand-ink placeholder:text-brand-steel/70 transition-colors hover:border-brand-steel/60 focus:outline-none focus:border-neon-deep focus:ring-2 focus:ring-neon-primary/50 disabled:opacity-60 disabled:bg-surface-muted disabled:cursor-not-allowed user-invalid:border-red-600 aria-[invalid=true]:border-red-600';

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Erro inesperado. Tente novamente.';
}

/**
 * Modal de cadastro. Usabilidade:
 * - Esc fecha, a rolagem da página fica travada e o foco vai para o primeiro campo (e volta ao fechar);
 * - se algum campo foi alterado, o clique no fundo é ignorado e o Esc/Fechar pede confirmação
 *   (evita perder o que foi digitado).
 */
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
  const panel = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const titleId = useId();

  const requestClose = useCallback(
    (fromBackdrop = false) => {
      if (dirty.current) {
        if (fromBackdrop) return;
        if (!window.confirm('Há dados preenchidos que ainda não foram salvos. Fechar mesmo assim?')) return;
      }
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    (first ?? panel.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [requestClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-brand-ink/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && requestClose(true)}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onInput={() => {
          dirty.current = true;
        }}
        className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-surface-white border border-line rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0 focus:outline-none animate-fade-up`}
      >
        <div className="sticky top-0 z-10 bg-surface-white flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b-[3px] border-transparent [border-image:linear-gradient(90deg,#3ee01f_55%,#c9a24a_55%)_1]">
          <h2 id={titleId} className="text-base sm:text-lg font-extrabold text-brand-ink truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => requestClose()}
            className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-xl text-brand-steel hover:text-brand-ink hover:bg-surface-muted"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

/** Campo com rótulo. Campos obrigatórios ganham " *" automaticamente (regra CSS em globals.css). */
export function Field({
  label,
  children,
  className = '',
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="field-label text-sm font-semibold text-brand-ink">{label}</span>
      {children}
      {hint && <span className="block text-xs text-brand-steel">{hint}</span>}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} role="alert" className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function ModalActions({ onCancel, saving, label = 'Salvar' }: { onCancel: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-line-soft">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="min-h-11 px-4 text-sm font-semibold rounded-xl border border-line text-brand-graphite hover:bg-surface-muted hover:text-brand-ink disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        aria-busy={saving || undefined}
        className="min-h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-bold rounded-xl bg-neon-primary hover:bg-neon-soft text-brand-ink transition-colors disabled:opacity-60"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
        {saving ? 'Salvando...' : label}
      </button>
    </div>
  );
}

type Tone = 'neutral' | 'danger' | 'warning' | 'success';
const TONES: Record<Tone, string> = {
  neutral: 'text-brand-graphite hover:text-brand-ink hover:bg-surface-muted border-line',
  danger: 'text-rose-700 hover:text-brand-ink hover:bg-rose-500/20 border-rose-500/30',
  warning: 'text-brand-graphite hover:text-brand-ink hover:bg-neon-primary/20 border-neon-deep/30',
  success: 'text-emerald-700 hover:text-brand-ink hover:bg-emerald-500/20 border-emerald-500/30',
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
      className={`inline-flex items-center justify-center gap-1 min-w-10 min-h-10 sm:min-w-8 sm:min-h-8 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${TONES[tone]}`}
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
    <div className="min-h-full bg-surface-offwhite text-brand-ink px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
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
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 relative pb-4 sm:pb-6 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[linear-gradient(90deg,#3ee01f_0,#3ee01f_22%,#c9a24a_22%,#c9a24a_30%,#e2e7e4_30%)]">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black italic tracking-tight text-brand-ink flex items-center gap-2.5">
          <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-neon-deep shrink-0" />
          <span className="min-w-0">{title}</span>
        </h1>
        {description && <p className="text-xs sm:text-sm text-brand-graphite mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </header>
  );
}

/** Botão primário padrão (também usado como Link via className). */
export const primaryBtnCls =
  'inline-flex items-center justify-center gap-2 min-h-11 bg-neon-primary hover:bg-neon-soft text-brand-ink font-bold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-neon-primary/25 transition-colors disabled:opacity-60';

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
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-graphite pointer-events-none" />
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
    'inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-lg border border-line text-sm font-semibold text-brand-graphite hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center justify-between gap-3 text-xs sm:text-sm text-brand-graphite">
      <span>
        {from}–{to} de <strong className="text-brand-ink">{total}</strong>
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
