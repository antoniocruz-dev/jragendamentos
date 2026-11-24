'use client';

import React from 'react';
import { X } from 'lucide-react';

/** Peças de interface reutilizadas pelas telas de cadastro (modal, campos, botões). */

export const inputCls =
  'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-60';

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
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
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
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{message}</div>;
}

export function ModalActions({ onCancel, saving, label = 'Salvar' }: { onCancel: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-60"
      >
        {saving ? 'Salvando...' : label}
      </button>
    </div>
  );
}

type Tone = 'neutral' | 'danger' | 'warning' | 'success';
const TONES: Record<Tone, string> = {
  neutral: 'text-slate-300 hover:text-white hover:bg-slate-800 border-slate-700',
  danger: 'text-rose-300 hover:text-white hover:bg-rose-500/20 border-rose-500/30',
  warning: 'text-amber-300 hover:text-white hover:bg-amber-500/20 border-amber-500/30',
  success: 'text-emerald-300 hover:text-white hover:bg-emerald-500/20 border-emerald-500/30',
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
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold transition-colors disabled:opacity-50 ${TONES[tone]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
