'use client';

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Modal acessível: no celular abre como folha inferior (bottom sheet); do sm em diante, centralizado.
 * Só fecha pelo botão Fechar (X) ou pelas ações do próprio conteúdo: clique no fundo e Esc não fecham.
 * Se algum campo foi alterado, o Fechar pede confirmação. Trava a rolagem da página e devolve o foco ao fechar.
 * `dismissible={false}` esconde o botão Fechar (o conteúdo decide quando fechar).
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
  const dirty = useRef(false);
  // onClose costuma ser uma função inline (nova a cada render). Guardá-la num ref impede que o efeito
  // de abertura rode de novo a cada tecla digitada e tire o foco do campo em edição.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (dirty.current && !window.confirm('Há dados preenchidos que ainda não foram salvos. Fechar mesmo assim?')) return;
    onCloseRef.current();
  }, []);

  // Só na montagem: trava a rolagem, foca o painel e devolve o foco ao desmontar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" data-area>
      <div className="absolute inset-0 bg-brand-ink/50 backdrop-blur-[2px]" aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onInput={() => {
          dirty.current = true;
        }}
        className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-surface-white text-brand-ink rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-fade-up focus:outline-none"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-brand-steel/30 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id={titleId} className="text-lg font-extrabold">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Fechar"
              className="-mr-2 -mt-2 w-11 h-11 inline-flex items-center justify-center rounded-xl text-brand-steel hover:text-brand-graphite hover:bg-brand-steel/10"
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
