'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Modal acessível: no celular abre como folha inferior (bottom sheet); do sm em diante, centralizado.
 * Fecha com Esc e no fundo; trava a rolagem da página e devolve o foco ao fechar.
 */
export function Modal({
  title,
  onClose,
  children,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  dismissible?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose, dismissible]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" data-area>
      <div className="absolute inset-0 bg-brand-brown-dark/50 backdrop-blur-[2px]" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-surface-white text-brand-brown-dark rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-fade-up focus:outline-none"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-brand-brown-light/30 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id={titleId} className="text-lg font-extrabold">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-2 -mt-2 w-11 h-11 inline-flex items-center justify-center rounded-xl text-brand-brown-light hover:text-brand-brown hover:bg-brand-brown-light/10"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
