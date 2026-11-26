import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

/** Emblema da logo (escudo com o carro e o "JR") em miniatura, para cabeçalhos. */
export function BrandMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logo-mark.webp"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn('rounded-xl shrink-0 ring-1 ring-gold/60 bg-brand-ink', className)}
    />
  );
}

/** Marca em texto: "JR" em prata e "Garage Center" no verde da logo. */
export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn('font-display tracking-tight truncate', className)}>
      <span className="text-silver-soft">JR </span>
      <span className="text-neon-primary">Garage Center</span>
    </span>
  );
}
