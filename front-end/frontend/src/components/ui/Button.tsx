'use client';

import React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Efeitos do Design System (ui_effects). Toque mínimo de 44x44px. */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-neon-primary text-brand-brown-dark font-bold transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-neon-soft hover:shadow-[0_0_16px_rgba(57,255,20,0.45)] active:scale-95',
  secondary:
    'bg-surface-white border border-brand-brown text-brand-brown font-semibold transition-all duration-200 hover:bg-brand-brown hover:text-white active:scale-95',
  ghost: 'text-brand-brown font-semibold transition-colors duration-200 hover:bg-brand-brown-light/10 active:scale-95',
  danger:
    'bg-surface-white border border-red-700 text-red-700 font-semibold transition-all duration-200 hover:bg-red-700 hover:text-white active:scale-95',
};

const BASE =
  'inline-flex items-center justify-center gap-2 min-h-11 min-w-11 px-4 rounded-xl text-sm select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-brown focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  block?: boolean;
  icon?: React.ReactNode;
}

export function Button({ variant = 'primary', loading, block, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  block,
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  block?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(BASE, VARIANTS[variant], block && 'w-full', className)}>
      {icon}
      {children}
    </Link>
  );
}
