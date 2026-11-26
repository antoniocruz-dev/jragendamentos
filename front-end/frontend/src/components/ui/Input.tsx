'use client';

import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

export const fieldCls =
  'w-full min-h-12 bg-surface-white border border-line rounded-xl px-3.5 text-base sm:text-sm text-brand-ink placeholder:text-brand-steel/70 transition-colors hover:border-brand-steel/60 focus:outline-none focus:border-neon-deep focus:ring-2 focus:ring-neon-primary/50 disabled:opacity-60 disabled:bg-surface-muted disabled:cursor-not-allowed aria-[invalid=true]:border-red-600 aria-[invalid=true]:focus:ring-red-200';

/** Campo com rótulo, ajuda e erro ligados por aria (o erro é anunciado por leitor de tela). */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-brand-ink">
        {label}
        {required && (
          <span className="text-red-700 font-bold" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-semibold text-red-700 flex items-start gap-1">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-brand-steel">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid} required={rest.required}>
      <input
        id={fid}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={cn(fieldCls, className)}
        {...rest}
      />
    </Field>
  );
}

/** Senha com botão de mostrar/ocultar (alvo de toque 44px). */
export function PasswordInput({ label, hint, error, id, className, ...rest }: InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid} required={rest.required}>
      <div className="relative">
        <input
          id={fid}
          type={visible ? 'text' : 'password'}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          className={cn(fieldCls, 'pr-12', className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-lg text-brand-steel hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-deep"
        >
          {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string | null }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid} required={rest.required}>
      <textarea
        id={fid}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={cn(fieldCls, 'py-3 min-h-24 resize-y', className)}
        {...rest}
      />
    </Field>
  );
}

/** Máscara de WhatsApp BR: (99) 99999-9999 */
export function maskWhatsapp(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const isValidWhatsapp = (value: string) => /^[1-9]{2}9\d{8}$/.test(value.replace(/\D/g, ''));
export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
