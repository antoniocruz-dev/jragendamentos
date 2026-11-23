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
} from 'lucide-react';
import { fetchApi } from '@/services/api';
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
  'w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50';

export default function TeamPage() {
  const [tab, setTab] = useState<'users' | 'profiles'>('users');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="border-b border-slate-800 pb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
            <UserCog className="w-8 h-8 text-amber-500" />
            Equipe
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Cadastre os usuários da oficina e defina quais módulos cada perfil pode acessar.
          </p>
        </div>

        <div className="flex gap-1.5">
          {(
            [
              ['users', 'Usuários', Users],
              ['profiles', 'Perfis e permissões', ShieldCheck],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                tab === key
                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
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

  async function updateUser(u: TeamUser, data: Partial<{ profile: StaffProfile; isActive: boolean; password: string }>) {
    try {
      setBusyId(u.id);
      await fetchApi(`/team/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      reload();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function handleResetPassword(u: TeamUser) {
    const password = prompt(`Nova senha para ${u.name} (mínimo 8 caracteres):`);
    if (password === null) return;
    if (password.length < 8) {
      alert('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    updateUser(u, { password });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-3 rounded-xl text-sm shadow-md shadow-amber-500/20"
        >
          <UserPlus className="w-5 h-5" />
          Novo usuário
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {error ? (
          <div className="p-6 text-sm text-rose-300">{error}</div>
        ) : loading ? (
          <div className="p-12 flex justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase font-bold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-5">Nome</th>
                  <th className="py-3 px-5">Contato</th>
                  <th className="py-3 px-5">Perfil</th>
                  <th className="py-3 px-5">Situação</th>
                  <th className="py-3 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  // Gerente Geral não mexe em contas de Administrador
                  const locked = u.profile === 'ADMINISTRADOR' && !iAmAdmin;
                  const busy = busyId === u.id;

                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                      <td className="py-3 px-5">
                        <div className="font-semibold text-white">
                          {u.name}
                          {isSelf && <span className="ml-2 text-[10px] text-amber-400">(você)</span>}
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <div>{u.email}</div>
                        {u.phone && <div className="text-xs text-slate-500">{u.phone}</div>}
                      </td>
                      <td className="py-3 px-5">
                        {locked || isSelf ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                            {locked && <Lock className="w-3.5 h-3.5 text-slate-500" />}
                            {u.profile ? PROFILE_LABELS[u.profile] : '—'}
                          </span>
                        ) : (
                          <select
                            value={u.profile ?? ''}
                            disabled={busy}
                            onChange={(e) => updateUser(u, { profile: e.target.value as StaffProfile })}
                            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                          >
                            {assignableProfiles.map((p) => (
                              <option key={p} value={p}>
                                {PROFILE_LABELS[p]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-3 px-5">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            u.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {u.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex justify-end gap-2">
                          {!locked && (
                            <button
                              onClick={() => handleResetPassword(u)}
                              disabled={busy}
                              title="Redefinir senha"
                              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              Senha
                            </button>
                          )}
                          {!locked && !isSelf && (
                            <button
                              onClick={() => updateUser(u, { isActive: !u.isActive })}
                              disabled={busy}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 ${
                                u.isActive
                                  ? 'bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border-rose-500/30'
                                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {u.isActive ? 'Desativar' : 'Reativar'}
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
    password: '',
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
        body: JSON.stringify({ ...form, phone: form.phone || undefined }),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">Novo usuário da equipe</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-400">Nome</span>
            <input required minLength={3} value={form.name} onChange={set('name')} className={`${inputCls} mt-1`} />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">E-mail (login)</span>
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
              <span className="text-xs font-semibold text-slate-400">Telefone</span>
              <input value={form.phone} onChange={set('phone')} className={`${inputCls} mt-1`} />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Perfil</span>
              <select value={form.profile} onChange={set('profile')} className={`${inputCls} mt-1`}>
                {profiles.map((p) => (
                  <option key={p} value={p}>
                    {PROFILE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Senha inicial</span>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={set('password')}
                className={`${inputCls} mt-1`}
                autoComplete="new-password"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            Os módulos que o usuário verá dependem do perfil (aba &quot;Perfis e permissões&quot;).
          </p>

          {error && (
            <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Cadastrar'}
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
      alert(errorMessage(err));
    } finally {
      setSavingProfile(null);
    }
  }

  if (error) return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-sm text-rose-300">{error}</div>;
  if (!data)
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 flex justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-xs uppercase font-bold text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-3 px-5 text-left">Perfil</th>
              {data.modules.map((m) => (
                <th key={m.key} className="py-3 px-3 text-center whitespace-nowrap">
                  {m.label}
                </th>
              ))}
              <th className="py-3 px-3 text-center whitespace-nowrap">Equipe</th>
              <th className="py-3 px-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {rows.map((p) => {
              const dirty = drafts[p.profile] !== undefined;
              return (
                <tr key={p.profile}>
                  <td className="py-3 px-5">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      {p.locked && <Lock className="w-3.5 h-3.5 text-slate-500" />}
                      {p.label}
                    </div>
                    <div className="text-[11px] text-slate-500">
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
                        className="w-4 h-4 accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                  ))}
                  <td className="py-3 px-3 text-center" title="Fixo: só Administrador e Gerente Geral gerenciam a equipe">
                    <input type="checkbox" checked={p.canManageTeam} disabled readOnly className="w-4 h-4 accent-amber-500" />
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    {p.locked ? (
                      <span className="text-[11px] text-slate-500">Acesso total</span>
                    ) : dirty ? (
                      <button
                        onClick={() => save(p.profile)}
                        disabled={savingProfile === p.profile}
                        className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                      >
                        {savingProfile === p.profile ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Salvar
                      </button>
                    ) : savedProfile === p.profile ? (
                      <span className="text-[11px] text-emerald-400">Salvo ✓</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        O Administrador sempre tem acesso total. A coluna &quot;Equipe&quot; (cadastro de usuários e configuração de perfis) é
        fixa: somente Administrador e Gerente Geral. As alterações valem na próxima ação de cada usuário.
      </p>
    </div>
  );
}
