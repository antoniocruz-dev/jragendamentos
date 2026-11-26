'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  UserCog,
  UserPlus,
  ShieldCheck,
  Lock,
  Save,
  X,
  Loader2,
  KeyRound,
  Users,
  Pencil,
  Trash2,
} from 'lucide-react';
import { fetchApi } from '@/services/api';
import { toast } from '@/components/feedback';
import { useAuth } from '@/services/auth';
import { PROFILE_LABELS, PROFILE_ORDER, type StaffProfile } from '@/services/permissions';

// ==========================================
// Tipos da API /team
// ==========================================

interface TeamUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profile: StaffProfile | null;
  isActive: boolean;
  commissionRate: string | number;
  accessCode?: string;
  whatsapp?: string | null;
  firstAccessPending?: boolean;
  createdAt: string;
}

interface ProfileRow {
  profile: StaffProfile;
  label: string;
  modules: string[];
  locked: boolean;
  canManageTeam: boolean;
  activeUsers: number;
}

interface ProfilesResponse {
  modules: { key: string; label: string }[];
  profiles: ProfileRow[];
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

const inputCls =
  'w-full bg-surface-offwhite border border-line/80 rounded-xl px-3 py-2.5 text-sm text-brand-ink placeholder-brand-steel focus:outline-none focus:border-neon-deep disabled:opacity-50';

export default function TeamPage() {
  const [tab, setTab] = useState<'users' | 'profiles'>('users');

  return (
    <div className="min-h-full bg-surface-offwhite text-brand-ink px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        <div className="border-b border-line-soft pb-4 sm:pb-6">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-brand-ink flex items-center gap-2.5">
            <UserCog className="w-6 h-6 sm:w-7 sm:h-7 text-neon-deep shrink-0" />
            Equipe
          </h1>
          <p className="text-xs sm:text-sm text-brand-graphite mt-1">
            Cadastre os usuários da oficina e defina quais módulos cada perfil pode acessar.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex gap-1.5">
          {(
            [
              ['users', 'Usuários', Users],
              ['profiles', 'Perfis e permissões', ShieldCheck],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all ${
                tab === key
                  ? 'bg-neon-primary text-brand-ink border-neon-deep'
                  : 'bg-surface-white text-brand-graphite border-line-soft hover:bg-surface-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'users' ? <UsersTab /> : <ProfilesTab />}
      </div>
    </div>
  );
}

// ==========================================
// Aba: Usuários
// ==========================================

function UsersTab() {
  const { user: me } = useAuth();
  const iAmAdmin = me?.profile === 'ADMINISTRADOR';

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApi<TeamUser[]>('/team/users')
      .then((data) => {
        if (!cancelled) {
          setUsers(data);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // Gerente Geral não pode atribuir o perfil Administrador
  const assignableProfiles = PROFILE_ORDER.filter((p) => iAmAdmin || p !== 'ADMINISTRADOR');

  async function updateUser(u: TeamUser, data: Partial<{ profile: StaffProfile; isActive: boolean; resetAccess: boolean }>) {
    try {
      setBusyId(u.id);
      await fetchApi(`/team/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      reload();
    } catch (err) {
      // o aviso de erro já é mostrado pelo fetchApi (toast)
      void err;
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(u: TeamUser) {
    if (!confirm(`Excluir definitivamente ${u.name}? As OS em que atuou ficam sem operador. Para só bloquear o acesso, use Desativar.`)) return;
    try {
      setBusyId(u.id);
      await fetchApi(`/team/users/${u.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      // o aviso de erro já é mostrado pelo fetchApi (toast)
      void err;
    } finally {
      setBusyId(null);
    }
  }

  // O gestor não define senha: a senha atual deixa de valer e a pessoa cadastra outra no primeiro acesso
  function handleResetAccess(u: TeamUser) {
    if (
      !confirm(
        `Redefinir o acesso de ${u.name}?\n\nA senha atual deixa de valer. A pessoa cadastra uma nova em "É meu primeiro acesso" (aba Equipe), com o e-mail ${u.email}. O usuário (código ${u.accessCode ?? ''}) continua o mesmo.`,
      )
    )
      return;
    updateUser(u, { resetAccess: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex sm:justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto justify-center inline-flex items-center gap-2 bg-neon-primary hover:bg-neon-deep text-brand-ink font-bold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-neon-primary/20"
        >
          <UserPlus className="w-5 h-5" />
          Novo usuário
        </button>
      </div>

      <div className="bg-surface-white border border-line-soft rounded-2xl overflow-hidden">
        {error ? (
          <div className="p-6 text-sm text-rose-700">{error}</div>
        ) : loading ? (
          <div className="p-12 flex justify-center text-brand-graphite">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-brand-graphite">
              <thead className="bg-surface-offwhite/80 text-xs uppercase font-bold text-brand-graphite border-b border-line-soft">
                <tr>
                  <th className="py-3 px-3 sm:px-5">Nome</th>
                  <th className="hidden md:table-cell py-3 px-3 sm:px-5">Contato</th>
                  <th className="hidden sm:table-cell py-3 px-3 sm:px-5">Perfil</th>
                  <th className="hidden lg:table-cell py-3 px-3 sm:px-5">Comissão</th>
                  <th className="hidden md:table-cell py-3 px-3 sm:px-5">Situação</th>
                  <th className="py-3 px-3 sm:px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft/80">
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  // Gerente Geral não mexe em contas de Administrador
                  const locked = u.profile === 'ADMINISTRADOR' && !iAmAdmin;
                  const busy = busyId === u.id;

                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                      <td className="py-3 px-3 sm:px-5">
                        <div className="font-semibold text-brand-ink">
                          {u.name}
                          {isSelf && <span className="ml-2 text-[10px] text-brand-graphite">(você)</span>}
                        </div>
                        <div className="md:hidden text-xs text-brand-graphite break-all">{u.email}</div>
                        {/* Código de 4 dígitos: entra com ele ou com o e-mail */}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-graphite">
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-neon-muted border border-neon-deep/40 px-2 py-0.5 text-brand-ink"
                            title="Código de acesso: entra com ele ou com o e-mail"
                          >
                            Código <span className="font-mono text-sm font-extrabold tracking-[0.2em]">{u.accessCode}</span>
                          </span>
                          {u.firstAccessPending && <span className="font-semibold text-orange-700">Aguardando primeiro acesso</span>}
                        </div>
                        <div className="lg:hidden text-xs text-brand-steel">
                          Comissão {Number(u.commissionRate).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                          {!u.isActive && <span className="md:hidden"> · Inativo</span>}
                        </div>
                        <div className="sm:hidden mt-1.5">
                          {locked || isSelf ? (
                            <span className="text-xs text-brand-graphite">{u.profile ? PROFILE_LABELS[u.profile] : '—'}</span>
                          ) : (
                            <select
                              value={u.profile ?? ''}
                              disabled={busy}
                              aria-label={`Perfil de ${u.name}`}
                              onChange={(e) => updateUser(u, { profile: e.target.value as StaffProfile })}
                              className="w-full bg-surface-offwhite border border-line/80 rounded-lg px-2 py-1.5 text-brand-ink focus:outline-none focus:border-neon-deep"
                            >
                              {assignableProfiles.map((p) => (
                                <option key={p} value={p}>
                                  {PROFILE_LABELS[p]}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="hidden md:table-cell py-3 px-3 sm:px-5">
                        <div>{u.email}</div>
                        {u.phone && <div className="text-xs text-brand-steel">{u.phone}</div>}
                      </td>
                      <td className="hidden sm:table-cell py-3 px-3 sm:px-5">
                        {locked || isSelf ? (
                          <span className="inline-flex items-center gap-1.5 text-brand-graphite">
                            {locked && <Lock className="w-3.5 h-3.5 text-brand-steel" />}
                            {u.profile ? PROFILE_LABELS[u.profile] : '—'}
                          </span>
                        ) : (
                          <select
                            value={u.profile ?? ''}
                            disabled={busy}
                            onChange={(e) => updateUser(u, { profile: e.target.value as StaffProfile })}
                            className="bg-surface-offwhite border border-line/80 rounded-lg px-2 py-1.5 text-sm text-brand-ink focus:outline-none focus:border-neon-deep"
                          >
                            {assignableProfiles.map((p) => (
                              <option key={p} value={p}>
                                {PROFILE_LABELS[p]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="hidden lg:table-cell py-3 px-3 sm:px-5 tabular-nums" title="Comissão sobre a mão de obra das OS faturadas">
                        {Number(u.commissionRate).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                      </td>
                      <td className="hidden md:table-cell py-3 px-3 sm:px-5">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            u.isActive
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                              : 'bg-surface-muted text-brand-graphite border-line'
                          }`}
                        >
                          {u.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:px-5">
                        <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2">
                          {!locked && (
                            <button
                              onClick={() => setEditingUser(u)}
                              disabled={busy}
                              title="Editar dados"
                              className="inline-flex items-center gap-1.5 bg-surface-muted hover:bg-surface-strong text-brand-graphite px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </button>
                          )}
                          {!locked && (
                            <button
                              onClick={() => handleResetAccess(u)}
                              disabled={busy}
                              title="Redefinir acesso (a pessoa cadastra nova senha)"
                              className="inline-flex items-center gap-1.5 bg-surface-muted hover:bg-surface-strong text-brand-graphite px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              Redefinir acesso
                            </button>
                          )}
                          {!locked && !isSelf && (
                            <button
                              onClick={() => updateUser(u, { isActive: !u.isActive })}
                              disabled={busy}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 ${
                                u.isActive
                                  ? 'bg-rose-600/10 hover:bg-rose-600/20 text-rose-700 border-rose-500/30'
                                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-700 border-emerald-500/30'
                              }`}
                            >
                              {u.isActive ? 'Desativar' : 'Reativar'}
                            </button>
                          )}
                          {!locked && !isSelf && (
                            <button
                              onClick={() => removeUser(u)}
                              disabled={busy}
                              title="Excluir usuário"
                              className="inline-flex items-center gap-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-700 border border-rose-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            reload();
          }}
        />
      )}

      {showForm && (
        <NewUserModal
          profiles={assignableProfiles}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function NewUserModal({
  profiles,
  onClose,
  onSaved,
}: {
  profiles: StaffProfile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    profile: (profiles.includes('MECANICO') ? 'MECANICO' : profiles[0]) as StaffProfile,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setSaving(true);
      await fetchApi('/team/users', {
        method: 'POST',
        // Sem senha: a pessoa conclui em "É meu primeiro acesso" (aba Equipe) e recebe o código no WhatsApp
        body: JSON.stringify({ ...form, phone: form.phone || undefined, whatsapp: form.phone || undefined }),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-surface-white border border-line-soft rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        <div className="sticky top-0 z-10 bg-surface-white flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-line-soft">
          <h3 className="text-lg font-bold text-brand-ink">Novo usuário da equipe</h3>
          <button type="button" onClick={onClose} className="text-brand-graphite hover:text-brand-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-brand-graphite">Nome</span>
            <input required minLength={3} value={form.name} onChange={set('name')} className={`${inputCls} mt-1`} />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-brand-graphite">E-mail (login)</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={set('email')}
                className={`${inputCls} mt-1`}
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-brand-graphite">Telefone</span>
              <input value={form.phone} onChange={set('phone')} className={`${inputCls} mt-1`} />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-brand-graphite">Perfil</span>
              <select value={form.profile} onChange={set('profile')} className={`${inputCls} mt-1`}>
                {profiles.map((p) => (
                  <option key={p} value={p}>
                    {PROFILE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-brand-steel">
            Os módulos que o usuário verá dependem do perfil (aba &quot;Perfis e permissões&quot;). A senha é cadastrada pela
            própria pessoa em &quot;É meu primeiro acesso&quot; (aba Equipe), com este e-mail; o usuário (código de 4 dígitos) chega no WhatsApp.
            Perfil Mecânico usa só o Portal do Mecânico.
          </p>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-surface-white flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-line-soft">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-surface-muted hover:bg-surface-strong text-sm font-semibold text-brand-graphite"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-neon-primary hover:bg-neon-deep text-brand-ink text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: TeamUser; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone ?? '', commissionRate: String(Number(user.commissionRate)) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setSaving(true);
      await fetchApi(`/team/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), commissionRate: Number(form.commissionRate) }),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-surface-white border border-line-soft rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        <div className="sticky top-0 z-10 bg-surface-white flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-line-soft">
          <h3 className="text-lg font-bold text-brand-ink">Editar usuário</h3>
          <button type="button" onClick={onClose} className="text-brand-graphite hover:text-brand-ink">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-brand-graphite">Nome</span>
            <input required minLength={3} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} mt-1`} />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-brand-graphite">E-mail (login)</span>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-brand-graphite">Telefone</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-brand-graphite">Comissão sobre a mão de obra (%)</span>
            <input type="number" required min={0} max={100} step="0.01" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} className={`${inputCls} mt-1`} />
            <span className="text-[11px] text-brand-steel">Padrão 50%. Vale para as próximas OS faturadas; as já faturadas mantêm a % da data do faturamento.</span>
          </label>
          <p className="text-[11px] text-brand-steel">Perfil, senha e situação são alterados direto na tabela.</p>
          {error && <div className="text-sm text-rose-700 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</div>}
        </div>
        <div className="sticky bottom-0 bg-surface-white flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-line-soft">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-surface-muted hover:bg-surface-strong text-sm font-semibold text-brand-graphite">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-neon-primary hover:bg-neon-deep text-brand-ink text-sm font-bold disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ==========================================
// Aba: Perfis e permissões
// ==========================================

function ProfilesTab() {
  const [data, setData] = useState<ProfilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Edições ainda não salvas, por perfil
  const [drafts, setDrafts] = useState<Partial<Record<StaffProfile, string[]>>>({});
  const [savingProfile, setSavingProfile] = useState<StaffProfile | null>(null);
  const [savedProfile, setSavedProfile] = useState<StaffProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApi<ProfilesResponse>('/team/profiles')
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => data?.profiles.map((p) => ({ ...p, current: drafts[p.profile] ?? p.modules })) ?? [],
    [data, drafts],
  );

  function toggle(profile: StaffProfile, module: string, base: string[]) {
    setSavedProfile(null);
    setDrafts((d) => {
      const current = d[profile] ?? base;
      const next = current.includes(module) ? current.filter((m) => m !== module) : [...current, module];
      return { ...d, [profile]: next };
    });
  }

  async function save(profile: StaffProfile) {
    const modules = drafts[profile];
    if (!modules) return;
    try {
      setSavingProfile(profile);
      const updated = await fetchApi<ProfilesResponse>(`/team/profiles/${profile}`, {
        method: 'PUT',
        body: JSON.stringify({ modules }),
      });
      setData(updated);
      setDrafts((d) => {
        const rest = { ...d };
        delete rest[profile];
        return rest;
      });
      setSavedProfile(profile);
    } catch (err) {
      // o aviso de erro já é mostrado pelo fetchApi (toast)
      void err;
    } finally {
      setSavingProfile(null);
    }
  }

  if (error) return <div className="bg-surface-white border border-line-soft rounded-2xl p-6 text-sm text-rose-700">{error}</div>;
  if (!data)
    return (
      <div className="bg-surface-white border border-line-soft rounded-2xl p-12 flex justify-center text-brand-graphite">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="bg-surface-white border border-line-soft rounded-2xl overflow-x-auto">
        <table className="w-full text-sm text-brand-graphite">
          <thead className="bg-surface-offwhite/80 text-xs uppercase font-bold text-brand-graphite border-b border-line-soft">
            <tr>
              <th className="sticky left-0 z-10 bg-surface-offwhite py-3 px-3 sm:px-5 text-left">Perfil</th>
              {data.modules.map((m) => (
                <th key={m.key} className="py-3 px-3 text-center whitespace-nowrap">
                  {m.label}
                </th>
              ))}
              <th className="py-3 px-3 text-center whitespace-nowrap">Equipe</th>
              <th className="py-3 px-3 text-center whitespace-nowrap">Excluir / Inativar</th>
              <th className="py-3 px-3 sm:px-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft/80">
            {rows.map((p) => {
              const dirty = drafts[p.profile] !== undefined;
              return (
                <tr key={p.profile}>
                  <td className="sticky left-0 z-10 bg-surface-white py-3 px-3 sm:px-5 min-w-36">
                    <div className="font-semibold text-brand-ink flex items-center gap-1.5">
                      {p.locked && <Lock className="w-3.5 h-3.5 text-brand-steel" />}
                      {p.label}
                    </div>
                    <div className="text-[11px] text-brand-steel">
                      {p.activeUsers} {p.activeUsers === 1 ? 'usuário ativo' : 'usuários ativos'}
                    </div>
                  </td>
                  {data.modules.map((m) => (
                    <td key={m.key} className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${p.label}: ${m.label}`}
                        checked={p.current.includes(m.key)}
                        disabled={p.locked || savingProfile === p.profile}
                        onChange={() => toggle(p.profile, m.key, p.modules)}
                        className="w-4 h-4 accent-brand-graphite cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                  ))}
                  <td className="py-3 px-3 text-center" title="Fixo: só Administrador e Gerente Geral gerenciam a equipe">
                    <input type="checkbox" checked={p.canManageTeam} disabled readOnly className="w-4 h-4 accent-brand-graphite" />
                  </td>
                  <td
                    className="py-3 px-3 text-center"
                    title="Fixo: só Administrador e Gerente Geral excluem ou inativam cadastros"
                  >
                    <input
                      type="checkbox"
                      aria-label={`${p.label}: excluir ou inativar cadastros`}
                      checked={p.canManageTeam}
                      disabled
                      readOnly
                      className="w-4 h-4 accent-brand-graphite"
                    />
                  </td>
                  <td className="py-3 px-3 sm:px-5 text-right whitespace-nowrap">
                    {p.locked ? (
                      <span className="text-[11px] text-brand-steel">Acesso total</span>
                    ) : dirty ? (
                      <button
                        onClick={() => save(p.profile)}
                        disabled={savingProfile === p.profile}
                        className="inline-flex items-center gap-1.5 bg-neon-primary hover:bg-neon-deep text-brand-ink px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                      >
                        {savingProfile === p.profile ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Salvar
                      </button>
                    ) : savedProfile === p.profile ? (
                      <span className="text-[11px] text-emerald-700">Salvo ✓</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-steel">
        O Administrador sempre tem acesso total. A coluna &quot;Equipe&quot; (cadastro de usuários e configuração de perfis) é
        fixa: somente Administrador e Gerente Geral. A coluna &quot;Excluir / Inativar&quot; também é fixa: só esses dois
        perfis excluem ou inativam cadastros (clientes, veículos, peças, serviços, agendamentos e usuários). As alterações valem na próxima ação de cada usuário.
      </p>
    </div>
  );
}
