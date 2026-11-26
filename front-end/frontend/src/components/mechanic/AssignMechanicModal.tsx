'use client';

import React, { useState } from 'react';
import { UserCog } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { Button, InlineError, Modal } from '@/components/ui';
import { MechanicSelect, useMechanics } from './MechanicSelect';

/** Atribuir / trocar o mecânico responsável da OS (Administrador e Gerente Geral). */
export function AssignMechanicModal({
  workOrderId,
  code,
  current,
  onClose,
  onSaved,
}: {
  workOrderId: string;
  code: number;
  current: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mechanics, loading, error: loadError } = useMechanics();
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError('Selecione o mecânico.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await fetchApi(`/work-orders/${workOrderId}/operator`, {
        method: 'PATCH',
        body: JSON.stringify({ operatorId: selected }),
        successToast: current ? 'Mecânico trocado.' : 'Mecânico atribuído.',
        errorToast: false,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${current ? 'Trocar' : 'Atribuir'} mecânico · OS #${code}`} onClose={onClose} dismissible={!saving}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface-offwhite p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-graphite text-white">
            <UserCog className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-brand-steel">Mecânico atual</p>
            <p className="truncate font-bold text-brand-ink">{current?.name ?? 'Sem mecânico'}</p>
          </div>
        </div>
        <MechanicSelect
          label={current ? 'Novo mecânico' : 'Mecânico responsável'}
          value={selected}
          onChange={setSelected}
          mechanics={mechanics}
          loading={loading}
          error={loadError}
          excludeId={current?.id}
          hint="A troca fica registrada nas observações da OS."
        />
        {!loading && !loadError && mechanics.filter((m) => m.id !== current?.id).length === 0 && (
          <p className="text-sm text-brand-graphite">Nenhum outro mecânico ativo. Cadastre em Equipe.</p>
        )}
        {error && <InlineError message={error} />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving} className="min-h-11">
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={!selected} className="min-h-11">
            {current ? 'Trocar mecânico' : 'Atribuir mecânico'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
