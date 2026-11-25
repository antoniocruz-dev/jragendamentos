'use client';

import React, { useEffect, useState } from 'react';
import { Wrench, LogIn, ShieldPlus, Loader2 } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { isClientUser, saveSession, type AuthSession } from '@/services/auth';

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Destino após o login: só caminhos internos (evita redirecionamento aberto). Cliente: só o portal. */
function nextPath(isClient: boolean) {
  const next = new URLSearchParams(window.location.search).get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : null;
  if (isClient) return safe && (safe.startsWith('/portal') || safe.startsWith('/os/')) ? safe : '/portal';
  return safe && !safe.startsWith('/portal') ? safe : '/';
}

export default function LoginPage() {
  // null = ainda verificando; true = banco sem usuários (primeiro acesso)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<{ setupRequired: boolean }>('/auth/setup', { skipAuthRedirect: true })
      .then((r) => setSetupRequired(r.setupRequired))
      .catch(() => setSetupRequired(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await fetchApi<AuthSession>(setupRequired ? '/auth/setup' : '/auth/login', {
        method: 'POST',
        skipAuthRedirect: true,
        successToast: false,
        errorToast: false,
        token: '', // não envia token antigo
        body: JSON.stringify(setupRequired ? { name, email, password } : { email, password }),
      });
      saveSession(session);
      window.location.assign(nextPath(isClientUser(session.user)));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500';

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-5"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto">
            <Wrench className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="text-xl font-extrabold text-white">
            JR <span className="text-amber-500">Agendamentos</span>
          </h1>
          <p className="text-xs text-slate-400">
            {setupRequired
              ? 'Primeiro acesso: crie a conta do administrador da oficina.'
              : 'Acesso restrito à equipe da oficina.'}
          </p>
        </div>

        {setupRequired === null ? (
          <div className="flex justify-center py-6 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {setupRequired && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">Nome</span>
                <input
                  required
                  minLength={3}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${inputCls} mt-1`}
                  autoComplete="name"
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-semibold text-slate-400">E-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputCls} mt-1`}
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Senha</span>
              <input
                type="password"
                required
                minLength={setupRequired ? 8 : 6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} mt-1`}
                autoComplete={setupRequired ? 'new-password' : 'current-password'}
              />
            </label>

            {error && (
              <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl text-sm transition-all"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : setupRequired ? (
                <ShieldPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {setupRequired ? 'Criar administrador e entrar' : 'Entrar'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
