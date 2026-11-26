'use client';

import React, { useRef } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: React.ReactNode;
}

/**
 * Abas com indicador inferior deslizante em neon-primary (largura igual por aba).
 * Teclado: setas esquerda/direita trocam de aba (padrão WAI-ARIA tabs).
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  label: string;
}) {
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('relative grid bg-surface-white border border-brand-steel/30 rounded-xl overflow-hidden', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it, i) => {
        const active = i === index;
        return (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            className={cn(
              'min-h-12 inline-flex items-center justify-center gap-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:bg-brand-steel/10',
              active ? 'text-brand-ink' : 'text-brand-steel hover:text-brand-graphite',
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-1 rounded-full bg-neon-primary shadow-[0_0_10px_rgba(63,224,31,0.6)] transition-transform duration-300 ease-out"
        style={{ width: `${100 / items.length}%`, transform: `translateX(${index * 100}%)` }}
      />
    </div>
  );
}
