import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from './Button';

/** Esqueleto de carregamento no tema claro. */
export function LightSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-surface-white border border-brand-brown-light/20 rounded-2xl p-4 space-y-3">
          <div className="h-4 w-1/3 rounded bg-brand-brown-light/15 animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-brand-brown-light/10 animate-pulse" />
          <div className="h-2 w-full rounded-full bg-brand-brown-light/10 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function LightError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="bg-surface-white border border-red-200 rounded-2xl p-5 text-center space-y-3">
      <AlertCircle className="w-8 h-8 text-red-700 mx-auto" aria-hidden />
      <p className="text-sm text-brand-brown-dark">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} icon={<RotateCw className="w-4 h-4" />}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="bg-surface-white border border-dashed border-brand-brown-light/40 rounded-2xl p-8 text-center space-y-2 animate-fade-up">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-neon-muted text-neon-deep flex items-center justify-center">{icon}</div>
      <p className="font-bold text-brand-brown-dark">{title}</p>
      {text && <p className="text-sm text-brand-brown-light">{text}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
      {message}
    </div>
  );
}
