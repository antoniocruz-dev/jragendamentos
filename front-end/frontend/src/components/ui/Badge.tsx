import React from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neon' | 'brown' | 'muted' | 'deep' | 'danger';

const TONES: Record<Tone, string> = {
  neon: 'bg-neon-primary text-brand-brown-dark',
  deep: 'bg-neon-muted text-brand-brown-dark border border-neon-deep/40',
  brown: 'bg-brand-brown text-white',
  muted: 'bg-surface-offwhite text-brand-brown border border-brand-brown-light/40',
  danger: 'bg-red-50 text-red-800 border border-red-200',
};

/** Badge de status. `pulse` = badge neon pulsante (orçamento aguardando decisão). */
export function Badge({ tone = 'muted', pulse, className, children }: { tone?: Tone; pulse?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap',
        TONES[tone],
        pulse && 'animate-neon-pulse',
        className,
      )}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-brand-brown-dark" aria-hidden />}
      {children}
    </span>
  );
}
