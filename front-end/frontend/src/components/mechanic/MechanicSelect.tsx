'use client';

import React, { useEffect, useId, useState } from 'react';
import { fetchApi } from '@/services/api';
import { Field, fieldCls } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface MechanicOption {
  id: string;
  name: string;
  profile: string | null;
}

/** Mecânicos ativos (Mecânico e Mecânico Chefe) para seletores e filtros. */
export function useMechanics(enabled = true) {
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchApi<MechanicOption[]>('/work-orders/mechanics')
      .then((list) => alive && (setMechanics(list), setError(null)))
      .catch(() => alive && setError('Não foi possível carregar os mecânicos.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return { mechanics, loading, error };
}

/**
 * Seletor de mecânico ativo (alvo de toque 44px). `emptyLabel` mostra a opção vazia
 * (ex.: "Sem mecânico (atribuir depois)"); sem ela, o campo exige uma escolha.
 */
export function MechanicSelect({
  label = 'Mecânico responsável',
  value,
  onChange,
  mechanics,
  loading,
  error,
  emptyLabel,
  excludeId,
  hint,
  className,
}: {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  mechanics: MechanicOption[];
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  excludeId?: string | null;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const options = excludeId ? mechanics.filter((m) => m.id !== excludeId) : mechanics;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        required={!emptyLabel}
        className={cn(fieldCls, 'min-h-11', className)}
      >
        {loading ? (
          <option value="">Carregando mecânicos...</option>
        ) : (
          <option value="" disabled={!emptyLabel}>
            {emptyLabel ?? 'Selecione o mecânico...'}
          </option>
        )}
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.profile === 'MECANICO_CHEFE' ? ' (Mecânico Chefe)' : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}
