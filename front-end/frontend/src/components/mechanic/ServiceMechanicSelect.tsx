'use client';

import React, { useState } from 'react';
import { fetchApi } from '@/services/api';
import { fieldCls } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MechanicOption } from './MechanicSelect';

/**
 * Troca o mecânico de um serviço da OS direto na lista de itens (Administrador e Gerente Geral).
 * Opção vazia: o serviço volta para o responsável da OS.
 */
export function ServiceMechanicSelect({
  orderId,
  itemId,
  serviceName,
  value,
  responsibleName,
  mechanics,
  loading,
  onChanged,
}: {
  orderId: string;
  itemId: string;
  serviceName: string;
  value: string;
  responsibleName?: string | null;
  mechanics: MechanicOption[];
  loading?: boolean;
  onChanged: (mechanic: { id: string; name: string } | null) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    if (next === value) return;
    setSaving(true);
    try {
      const res = await fetchApi<{ mechanic: { id: string; name: string } | null }>(
        `/work-orders/${orderId}/items/${itemId}/mechanic`,
        {
          method: 'PATCH',
          body: JSON.stringify({ mechanicId: next || null }),
          successToast: 'Mecânico do serviço atualizado.',
        },
      );
      onChanged(res.mechanic);
    } catch {
      // O erro já aparece no toast do fetchApi; o seletor volta ao valor salvo
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      onChange={(e) => change(e.target.value)}
      disabled={loading || saving}
      aria-label={`Mecânico do serviço ${serviceName}`}
      className={cn(fieldCls, 'mt-1.5 min-h-10 py-1.5 text-sm font-normal max-w-xs')}
    >
      <option value="">{responsibleName ? `Responsável (${responsibleName})` : 'Responsável da OS (sem mecânico)'}</option>
      {mechanics.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {m.profile === 'MECANICO_CHEFE' ? ' (Chefe)' : ''}
        </option>
      ))}
    </select>
  );
}
