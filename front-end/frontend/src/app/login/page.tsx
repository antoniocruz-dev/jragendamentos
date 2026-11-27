'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { CalendarCheck, HardHat, KeyRound, LogIn, ShieldPlus, User } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { markPayablesAlert } from '@/lib/payables-alert';
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
  // Equipe sempre entra pelo Início (Dashboard); quem não tem esse módulo é levado pelo AuthGate à primeira tela permitida
  return '/';
}

/** Leva o foco ao primeiro campo com erro (quem usa teclado ou leitor de tela não precisa procurar). */
function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
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
    <div data-area className="login-bg min-h-dvh text-white flex flex-col relative overflow-hidden">
      {/* Filetes verde + dourado da logo, no topo */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#3ee01f_0,#3ee01f_55%,#c9a24a_55%,#e3c474_100%)]" />

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-6 grid lg:grid-cols-2 lg:gap-10 items-center">
        {/* Marca */}
        <section className="text-center lg:text-left flex flex-col items-center lg:items-start">
          <Image
            src="/logo-jr.webp"
            alt="JR Garage Center – Soluções e Performance Automotiva"
            width={880}
            height={758}
            priority
            unoptimized
            className="logo-fade animate-logo-in w-60 sm:w-72 lg:w-[30rem] h-auto drop-shadow-[0_0_30px_rgba(62,224,31,0.28)]"
          />
          <p className="hidden lg:block mt-2 max-w-md text-silver text-base leading-relaxed">
            Agendamentos, ordens de serviço e financeiro da oficina em um só lugar. Acompanhe cada etapa do seu veículo, do orçamento à entrega.
          </p>
          <ul className="hidden lg:flex mt-5 flex-wrap gap-2 text-xs font-bold uppercase tracking-wider">
            {['Agendamento online', 'Aprovação de orçamento', 'Acompanhamento da O.S.'].map((t) => (
              <li key={t} className="rounded-full border border-gold/50 bg-gold/10 text-gold-soft px-3 py-1.5">
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Formulário */}
        <section className="w-full max-w-md mx-auto lg:mx-0 lg:ml-auto -mt-2 lg:mt-0">
          <div className="bg-surface-white text-brand-ink border border-gold/40 rounded-3xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.7),0_0_0_1px_rgba(62,224,31,0.15)] overflow-hidden animate-fade-up">
            <div aria-hidden className="h-1.5 bg-[linear-gradient(90deg,#3ee01f_0,#3ee01f_55%,#c9a24a_55%,#e3c474_100%)]" />
            <div className="p-5 sm:p-7 space-y-5">
              {setupRequired === null ? (
                <div className="space-y-3" role="status" aria-label="Carregando">
                  <div className="h-12 rounded-xl bg-brand-steel/10 animate-pulse" />
                  <div className="h-12 rounded-xl bg-brand-steel/10 animate-pulse" />
                  <div className="h-12 rounded-xl bg-brand-steel/10 animate-pulse" />
                </div>
              ) : setupRequired ? (
                <SetupForm />
              ) : (
                <>
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl text-brand-ink">Bem-vindo</h1>
                    <p className="text-sm text-brand-steel mt-0.5">Escolha como deseja entrar.</p>
                  </div>
                  <Tabs<Tab>
                    label="Tipo de acesso"
                    value={tab}
                    onChange={(t) => {
                      setTab(t);
                      setStaffFirstAccess(false);
                    }}
                    items={[
                      { key: 'CLIENTE', label: 'Sou cliente', icon: <User className="w-4 h-4" aria-hidden /> },
                      { key: 'EQUIPE', label: 'Sou da equipe', icon: <HardHat className="w-4 h-4" aria-hidden /> },
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
        </section>
      </div>

      <footer className="relative text-center text-[11px] text-silver/70 pb-[calc(env(safe-area-inset-bottom)+1rem)] px-4">
        JR Garage Center · Soluções e Performance Automotiva
      </footer>
    </div>
  );
}

// ==========================================
// CLIENTE: nome completo, e-mail e contato (sem senha)
// ==========================================

/** Marca no aparelho que o cliente já entrou uma vez: a tela abre direto em "Já tenho cadastro". */
const CLIENT_KNOWN_KEY = 'jr_client_known';

function clientIsKnown() {
  try {
    return window.localStorage.getItem(CLIENT_KNOWN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberClient() {
  try {
    window.localStorage.setItem(CLIENT_KNOWN_KEY, '1');
  } catch {
    /* navegador sem localStorage: só perde a sugestão da aba */
  }
}

type ClientMode = 'PRIMEIRO' | 'RETORNO';

/**
 * Cliente: "Primeiro acesso" (nome, e-mail e contato; cria o cadastro, sem senha nem confirmação
 * de e-mail) ou "Já tenho cadastro" (e-mail + 4 últimos dígitos do telefone cadastrado).
 */
function ClientEntryForm() {
  // O formulário só aparece depois de consultar a API (já no navegador), como initialTab()
  const [mode, setMode] = useState<ClientMode>(() => (typeof window !== 'undefined' && clientIsKnown() ? 'RETORNO' : 'PRIMEIRO'));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold">Agendamento</h2>
        <p className="text-sm text-brand-steel">Agende serviços e acompanhe suas O.S. Não precisa de senha.</p>
      </div>
      <div role="radiogroup" aria-label="Tipo de acesso" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-muted">
        {(
          [
            ['PRIMEIRO', 'Primeiro acesso'],
            ['RETORNO', 'Já tenho cadastro'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`min-h-10 rounded-lg text-sm font-semibold transition-colors ${
              mode === value ? 'bg-surface-white text-brand-ink shadow-sm' : 'text-brand-steel hover:text-brand-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'PRIMEIRO' ? <ClientFirstAccessForm /> : <ClientReturnForm />}
    </div>
  );
}

async function enterClientArea(path: string, body: object) {
  const session = await fetchApi<AuthSession>(path, {
    method: 'POST',
    skipAuthRedirect: true,
    successToast: false,
    errorToast: false,
    token: '',
    body: JSON.stringify(body),
  });
  saveSession(session);
  rememberClient();
  window.location.assign(nextPath(session.user));
}

function ClientFirstAccessForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const errs: Record<string, string> = {};
    if (!/^\S+(\s+\S+)+$/.test(name.trim()) || name.trim().length < 5) errs.name = 'Informe o nome completo (nome e sobrenome).';
    if (!isValidEmail(email)) errs.email = 'Informe um e-mail válido.';
    if (!isValidPhone(phone)) errs.phone = 'Informe o telefone com DDD. Ex.: (94) 99999-9999';
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid(form);
    setSubmitting(true);
    try {
      await enterClientArea('/auth/client-entry', { name: name.trim(), email: email.trim(), phone: phone.replace(/\D/g, '') });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
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
        Criar meu acesso
      </Button>
      <p className="text-xs text-center text-brand-steel">Já é cliente da oficina? Use o mesmo e-mail e telefone informados no atendimento.</p>
    </form>
  );
}

function ClientReturnForm() {
  const [email, setEmail] = useState('');
  const [last4, setLast4] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const errs: Record<string, string> = {};
    if (!isValidEmail(email)) errs.email = 'Informe um e-mail válido.';
    if (!/^\d{4}$/.test(last4)) errs.last4 = 'Informe os 4 últimos dígitos do telefone cadastrado.';
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid(form);
    setSubmitting(true);
    try {
      await enterClientArea('/auth/client-login', { email: email.trim(), phoneLast4: last4 });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
      <Input
        label="4 últimos dígitos do telefone"
        hint="Do telefone ou WhatsApp que você informou no cadastro"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0000"
        maxLength={4}
        value={last4}
        onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
        error={errors.last4}
        required
      />
      <InlineError message={error} />
      <Button type="submit" block loading={submitting} icon={<LogIn className="w-4 h-4" aria-hidden />} className="min-h-12">
        Acessar meu painel
      </Button>
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const id = identifier.trim();
    const byCode = /^\d{4}$/.test(id);
    const errs: Record<string, string> = {};
    if (!byCode && !isValidEmail(id)) errs.identifier = 'Informe o seu código de 4 dígitos ou o e-mail cadastrado.';
    if (!password) errs.password = 'Informe a senha.';
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid(form);
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
      markPayablesAlert(); // alerta de contas a pagar no Dashboard (a cada login)
      window.location.assign(nextPath(session.user));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-brand-steel">Acesso da equipe da oficina.</p>
      <Input
        label="Código ou e-mail"
        hint="Seu código de 4 dígitos (tela Equipe) ou o e-mail cadastrado"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="0000 ou nome@email.com"
        enterKeyHint="next"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={errors.identifier}
        required
      />
      <PasswordInput label="Senha" autoComplete="current-password" enterKeyHint="go" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required />
      <InlineError message={error} />
      <Button type="submit" block loading={submitting} icon={<LogIn className="w-4 h-4" aria-hidden />} className="min-h-12">
        Entrar
      </Button>
      <div className="flex justify-center">
        <button type="button" onClick={onFirstAccess} className="min-h-11 px-3 text-sm font-bold text-brand-graphite underline-offset-4 hover:underline">
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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const errs: Record<string, string> = {};
    if (!isValidEmail(email)) errs.email = 'Informe um e-mail válido.';
    if (password.length < 8) errs.password = 'A senha deve ter no mínimo 8 caracteres.';
    if (confirmation !== password) errs.confirmation = 'As senhas não conferem.';
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid(form);
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
          <p className="text-sm text-brand-steel">Use o e-mail que o gestor cadastrou para você e crie a sua senha.</p>
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
            <p className="font-mono text-4xl font-extrabold tracking-[0.4em] text-brand-ink bg-gold-muted border border-gold rounded-2xl py-4">
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
        <p className="text-sm text-brand-steel">Crie a conta do administrador da oficina.</p>
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
