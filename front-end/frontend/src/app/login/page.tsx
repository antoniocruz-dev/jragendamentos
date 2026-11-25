'use client';

import React, { useEffect, useState } from 'react';
import { CalendarCheck, HardHat, KeyRound, LogIn, ShieldPlus, User, Wrench } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { CLIENT_HOME, MECHANIC_HOME, isClientUser, isMechanicUser, saveSession, type AuthSession } from '@/services/auth';
import { Button, InlineError, Input, Modal, PasswordInput, Tabs, isValidEmail } from '@/components/ui';

type Tab = 'CLIENTE' | 'EQUIPE';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Telefone BR com DDD: (99) 9999-9999 ou (99) 99999-9999 */
function maskPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const isValidPhone = (v: string) => /^[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(v.replace(/\D/g, ''));

/** Destino após entrar: só caminhos internos (evita redirecionamento aberto) e dentro da área do usuário. */
function nextPath(user: AuthSession['user']) {
  const next = new URLSearchParams(window.location.search).get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : null;
  if (isClientUser(user)) return safe && safe.startsWith('/cliente') ? safe : CLIENT_HOME;
  if (isMechanicUser(user)) return safe && safe.startsWith('/mecanico/') ? safe : MECHANIC_HOME;
  return safe && !/^\/(cliente|mecanico|portal)(\/|$)/.test(safe) ? safe : '/';
}

function initialTab(): Tab {
  if (typeof window === 'undefined') return 'CLIENTE';
  return new URLSearchParams(window.location.search).get('aba') === 'equipe' ? 'EQUIPE' : 'CLIENTE';
}

export default function LoginPage() {
  // null = verificando; true = banco sem usuários (criação do administrador inicial)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [staffFirstAccess, setStaffFirstAccess] = useState(false);

  useEffect(() => {
    fetchApi<{ setupRequired: boolean }>('/auth/setup', { skipAuthRedirect: true })
      .then((r) => setSetupRequired(r.setupRequired))
      .catch(() => setSetupRequired(false));
  }, []);

  return (
    <div data-area className="min-h-dvh bg-surface-offwhite text-brand-brown-dark flex flex-col">
      <div className="bg-brand-brown-dark text-white pt-[calc(env(safe-area-inset-top)+2rem)] pb-16 px-4 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-neon-primary text-brand-brown-dark flex items-center justify-center shadow-[0_0_24px_rgba(57,255,20,0.45)]">
          <Wrench className="w-7 h-7" aria-hidden />
        </div>
        <h1 className="mt-3 text-2xl font-extrabold">
          JR <span className="text-neon-primary">Garage Center</span>
        </h1>
        <p className="text-sm text-white/75 mt-1">Agendamentos e Ordens de Serviço</p>
      </div>

      <div className="flex-1 px-4 -mt-10 pb-10">
        <div className="mx-auto w-full max-w-md bg-surface-white border border-brand-brown-light/30 rounded-3xl shadow-xl p-5 sm:p-7 space-y-5 animate-fade-up">
          {setupRequired === null ? (
            <div className="space-y-3" role="status" aria-label="Carregando">
              <div className="h-12 rounded-xl bg-brand-brown-light/10 animate-pulse" />
              <div className="h-12 rounded-xl bg-brand-brown-light/10 animate-pulse" />
              <div className="h-12 rounded-xl bg-brand-brown-light/10 animate-pulse" />
            </div>
          ) : setupRequired ? (
            <SetupForm />
          ) : (
            <>
              <Tabs<Tab>
                label="Tipo de acesso"
                value={tab}
                onChange={(t) => {
                  setTab(t);
                  setStaffFirstAccess(false);
                }}
                items={[
                  { key: 'CLIENTE', label: 'Cliente', icon: <User className="w-4 h-4" aria-hidden /> },
                  { key: 'EQUIPE', label: 'Equipe', icon: <HardHat className="w-4 h-4" aria-hidden /> },
                ]}
              />
              <div role="tabpanel" key={`${tab}-${staffFirstAccess}`} className="animate-fade-up">
                {tab === 'CLIENTE' ? (
                  <ClientEntryForm />
                ) : staffFirstAccess ? (
                  <StaffFirstAccessForm onBack={() => setStaffFirstAccess(false)} />
                ) : (
                  <StaffLoginForm onFirstAccess={() => setStaffFirstAccess(true)} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// CLIENTE: nome completo, e-mail e contato (sem senha)
// ==========================================

function ClientEntryForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (!/^\S+(\s+\S+)+$/.test(name.trim()) || name.trim().length < 5) errs.name = 'Informe o nome completo (nome e sobrenome).';
    if (!isValidEmail(email)) errs.email = 'Informe um e-mail válido.';
    if (!isValidPhone(phone)) errs.phone = 'Informe o telefone com DDD. Ex.: (94) 99999-9999';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const session = await fetchApi<AuthSession>('/auth/client-entry', {
        method: 'POST',
        skipAuthRedirect: true,
        successToast: false,
        errorToast: false,
        token: '',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.replace(/\D/g, '') }),
      });
      saveSession(session);
      window.location.assign(nextPath(session.user));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-lg font-extrabold">Agendamento</h2>
        <p className="text-sm text-brand-brown-light">Informe seus dados para agendar serviços e acompanhar suas O.S. Não precisa de senha.</p>
      </div>
      <Input label="Nome completo" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
      <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
      <Input
        label="Contato"
        hint="Telefone ou WhatsApp com DDD"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="(94) 99999-9999"
        value={phone}
        onChange={(e) => setPhone(maskPhone(e.target.value))}
        error={errors.phone}
        required
      />
      <InlineError message={error} />
      <Button type="submit" block loading={submitting} icon={<CalendarCheck className="w-4 h-4" aria-hidden />} className="min-h-12">
        Acessar meu painel
      </Button>
      <p className="text-xs text-center text-brand-brown-light">Já é cliente? Use o mesmo e-mail e telefone informados na oficina.</p>
    </form>
  );
}

// ==========================================
// EQUIPE: código de 4 dígitos ou e-mail + senha
// ==========================================

function StaffLoginForm({ onFirstAccess }: { onFirstAccess: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const id = identifier.trim();
    const byCode = /^\d{4}$/.test(id);
    if (!byCode && !isValidEmail(id)) return setError('Informe o seu código de 4 dígitos ou o e-mail cadastrado.');
    if (!password) return setError('Informe a senha.');
    setSubmitting(true);
    try {
      const session = await fetchApi<AuthSession>('/auth/login', {
        method: 'POST',
        skipAuthRedirect: true,
        successToast: false,
        errorToast: false,
        token: '',
        body: JSON.stringify(byCode ? { accessCode: id, password, tab: 'EQUIPE' } : { email: id, password, tab: 'EQUIPE' }),
      });
      saveSession(session);
      window.location.assign(nextPath(session.user));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-brand-brown-light">Acesso da equipe da oficina.</p>
      <Input
        label="Código ou e-mail"
        hint="Seu código de 4 dígitos (tela Equipe) ou o e-mail cadastrado"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="0000 ou nome@email.com"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
      />
      <PasswordInput label="Senha" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <InlineError message={error} />
      <Button type="submit" block loading={submitting} icon={<LogIn className="w-4 h-4" aria-hidden />} className="min-h-12">
        Entrar
      </Button>
      <div className="flex justify-center">
        <button type="button" onClick={onFirstAccess} className="min-h-11 px-3 text-sm font-bold text-brand-brown underline-offset-4 hover:underline">
          É meu primeiro acesso
        </button>
      </div>
    </form>
  );
}

/** Convidado pelo gestor (tela Equipe): cadastra a própria senha e recebe o código de 4 dígitos. */
function StaffFirstAccessForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ name: string; accessCode: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (!isValidEmail(email)) errs.email = 'Informe um e-mail válido.';
    if (password.length < 8) errs.password = 'A senha deve ter no mínimo 8 caracteres.';
    if (confirmation !== password) errs.confirmation = 'As senhas não conferem.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const res = await fetchApi<{ name: string; accessCode: string }>('/auth/first-access', {
        method: 'POST',
        skipAuthRedirect: true,
        successToast: false,
        errorToast: false,
        token: '',
        body: JSON.stringify({ email: email.trim(), password, passwordConfirmation: confirmation }),
      });
      setResult(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <h2 className="text-lg font-extrabold">Primeiro acesso</h2>
          <p className="text-sm text-brand-brown-light">Use o e-mail que o gestor cadastrou para você e crie a sua senha.</p>
        </div>
        <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <PasswordInput
          label="Senha"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />
        <PasswordInput
          label="Confirmação de senha"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={errors.confirmation}
          required
        />
        <InlineError message={error} />
        <Button type="submit" block loading={submitting} icon={<KeyRound className="w-4 h-4" aria-hidden />} className="min-h-12">
          Criar minha senha
        </Button>
        <Button variant="ghost" block onClick={onBack}>
          Voltar ao login
        </Button>
      </form>

      {result && (
        <Modal
          title="Acesso criado!"
          onClose={() => {
            setResult(null);
            onBack();
          }}
        >
          <div className="space-y-4 text-center">
            <p className="text-sm">
              {result.name.split(' ')[0]}, este é o seu <strong>código de acesso</strong>. Entre com ele (ou com o seu e-mail) e a senha que você acabou de criar.
            </p>
            <p className="font-mono text-4xl font-extrabold tracking-[0.4em] text-brand-brown-dark bg-neon-muted border border-neon-deep/40 rounded-2xl py-4">
              {result.accessCode}
            </p>
            <Button
              block
              onClick={() => {
                setResult(null);
                onBack();
              }}
            >
              Ir para o login
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ==========================================
// INSTALAÇÃO: sem nenhum usuário, cria o administrador
// ==========================================

function SetupForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await fetchApi<AuthSession>('/auth/setup', {
        method: 'POST',
        skipAuthRedirect: true,
        successToast: false,
        errorToast: false,
        token: '',
        body: JSON.stringify({ name, email, password }),
      });
      saveSession(session);
      window.location.assign('/');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">Configuração inicial</h2>
        <p className="text-sm text-brand-brown-light">Crie a conta do administrador da oficina.</p>
      </div>
      <Input label="Nome" required minLength={3} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <PasswordInput label="Senha" required minLength={8} hint="Mínimo de 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <InlineError message={error} />
      <Button type="submit" block loading={submitting} icon={<ShieldPlus className="w-4 h-4" aria-hidden />}>
        Criar administrador e entrar
      </Button>
    </form>
  );
}
