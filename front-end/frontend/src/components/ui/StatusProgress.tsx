import React from 'react';
import { PROGRESS_STEPS, STATUS_INFO, type WorkOrderStatus } from '@/lib/os-status';
import { cn } from '@/lib/cn';

/** Barra de progresso do status da O.S (5 etapas). Cancelada: barra vermelha sem etapas. */
export function StatusProgress({ status, showLabels = false }: { status: WorkOrderStatus; showLabels?: boolean }) {
  const info = STATUS_INFO[status] ?? STATUS_INFO.DRAFT;
  const cancelled = status === 'CANCELLED';
  const pct = cancelled ? 100 : (info.step / PROGRESS_STEPS.length) * 100;
  return (
    <div>
      <div
        className="h-2 w-full rounded-full bg-brand-brown-light/15 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={PROGRESS_STEPS.length}
        aria-valuenow={cancelled ? 0 : info.step}
        aria-valuetext={info.label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            cancelled ? 'bg-red-300' : info.step >= PROGRESS_STEPS.length ? 'bg-neon-deep' : 'bg-neon-primary',
          )}
          style={{ width: `${Math.max(pct, cancelled ? 100 : 6)}%` }}
        />
      </div>
      {showLabels && !cancelled && (
        <ol className="mt-2 grid grid-cols-5 gap-1 text-[10px] sm:text-xs text-center">
          {PROGRESS_STEPS.map((s, i) => (
            <li key={s} className={cn(i < info.step ? 'text-brand-brown-dark font-semibold' : 'text-brand-brown-light')}>
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
