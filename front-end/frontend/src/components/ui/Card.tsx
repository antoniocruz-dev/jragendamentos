import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export type Accent = 'neon' | 'brown' | 'muted' | 'deep' | 'danger' | 'none';

const ACCENT: Record<Accent, string> = {
  neon: 'border-l-neon-primary',
  deep: 'border-l-neon-deep',
  brown: 'border-l-brand-brown',
  muted: 'border-l-brand-brown-light/50',
  danger: 'border-l-red-600',
  none: '',
};

/** Card padrão: fundo branco, borda sutil, entrada fade-in + slide-up e borda esquerda de status. */
export function Card({
  accent = 'none',
  className,
  children,
  as: Tag = 'div',
  delay = 0,
}: {
  accent?: Accent;
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'section' | 'li' | 'article';
  /** Atraso da animação (ms) para listas em cascata */
  delay?: number;
}) {
  return (
    <Tag
      className={cn(
        'bg-surface-white border border-brand-brown-light/30 rounded-2xl p-4 shadow-sm animate-fade-up',
        accent !== 'none' && 'border-l-4',
        ACCENT[accent],
        className,
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/** Card inteiro clicável (lista de O.S). */
export function CardLink({
  href,
  accent = 'none',
  className,
  children,
  delay = 0,
}: {
  href: string;
  accent?: Accent;
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'block bg-surface-white border border-brand-brown-light/30 rounded-2xl p-4 shadow-sm animate-fade-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-brown',
        accent !== 'none' && 'border-l-4',
        ACCENT[accent],
        className,
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Link>
  );
}
