'use client';

import React, { useEffect, useState } from 'react';
import { HardHat, KeyRound, LogIn, MessageCircle, ShieldPlus, User, Wrench } from 'lucide-react';
import { fetchApi } from '@/services/api';
import { CLIENT_HOME, MECHANIC_HOME, isClientUser, isMechanicUser, saveSession, type AuthSession } from '@/services/auth';
import {
  Button,
  InlineError,
  Input,
  Modal,
  PasswordInput,
  Tabs,
  isValidEmail,
  isValidWhatsapp,
  maskWhatsapp,
} from '@/components/ui';

type Tab = 'CLIENTE' | 'EQUIPE';
type Mode = 'login' | 'first';

interface FirstAccessResult {
  created: boolean;
  whatsappSent: boolean;
  whatsappMasked: string;
  accessLink: string;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Destino após o login: só caminhos internos (evita redirecionamento aberto) e dentro da área do usuário. */
function nextPath(user: AuthSession['user']) {
  const next = new URLSearchParams(window.location.search).get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : null;
  if (isClientUser(user)) return safe && safe.startsWith('/cliente') ? safe : CLIENT_HOME;
  if (isMechanicUser(user)) return safe && safe.startsWith('/mecanico/') ? safe : MECHANIC_HOME;
  return safe && !/^\/(cliente|mecanico|portal)(\/|$)/.test(safe) ? safe : '/';
}

function initialTab(): Tab {
  if (typeof window === 'undefined') return 'CLIENTE';
  const aba = new URLSearchParams(window.location.search).get('aba');
  return aba === 'equipe' ? 'EQUIPE' : 'CLIENTE';
}

export default function LoginPage() {
  // null = verificando; true = banco sem usuários (criação do administrador inicial)
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mode, setMode] = useState<Mode>('login');

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
                  setMode('login');
                }}
                items={[
                  { key: 'CLIENTE', label: 'Cliente', icon: <User className="w-4 h-4" aria-hidden /> },
                  { key: 'EQUIPE', label: 'Equipe', icon: <HardHat className="w-4 h-4" aria-hidden /> },
                ]}
              />
              <div role="tabpanel" key={`${tab}-${mode}`} className="animate-fade-up">
                {mode === 'login' ? (
                  <LoginForm tab={tab} onFirstAccess={() => setMode('first')} />
                ) : (
                  <FirstAccessForm tab={tab} onBack={() => setMode('login')} />
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
// LOGIN: código de 4 dígitos + senha
// ==========================================

function LoginForm({ tab, onFirstAccess }: { tab: Tab; onFirstAccess: () => void }) {
  const [accessCode, setAccessCode] = useState('');
  const [email, setEmail] = useState('');
  // Equipe pode entrar com o e-mail (contas antigas que ainda não guardaram o código)
  const [useEmail, setUseEmail] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byEmail = tab === 'EQUIPE' && useEmail;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!byEmail && !/^\d{4}$/.test(accessCode)) return setError('O código de acesso tem 4 dígitos.');
    if (byEmail && !isValidEmail(email)) return setError('Informe um e-mail válido.');
    if (!password) return setError('Informe a senha.');
    setSubmitting(true);
    try {
      const session = await fetchApi<AuthSession>('/auth/login', {
        method: 'POST',
        skipAuthRedirect: true,
        successToast: false,
        errorToast: false,
        token: '',
        body: JSON.stringify(byEmail ? { email: email.trim(), password, tab } : { accessCode, password, tab }),
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
      <p className="text-sm text-brand-brown-light">
        {tab === 'CLIENTE' ? 'Acompanhe suas O.S, aprove orçamentos e agende serviços.' : 'Acesso da equipe da oficina.'}
      </p>
      {byEmail ? (
        <Input label="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      ) : (
        <Input
          label="Código de acesso"
          hint="4 dígitos recebidos no WhatsApp"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="username"
          placeholder="0000"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="text-center text-2xl font-mono tracking-[0.6em] placeholder:tracking-[0.6em]"
          required
        />
      )}
      <PasswordInput label="Senha" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <InlineError message={error} />
      <Button type="submit" block loading={submitting} icon={<LogIn className="w-4 h-4" aria-hidden />}>
        Entrar
      </Button>
      <div className="flex flex-col items-center gap-1 pt-1">
        <button type="button" onClick={onFirstAccess} className="min-h-11 px-3 text-sm font-bold text-brand-brown underline-offset-4 hover:underline">
          É meu primeiro acesso
        </button>
        {tab === 'EQUIPE' && (
          <button
            type="button"
            onClick={() => setUseEmail((v) => !v)}
            className="min-h-11 px-3 text-xs font-semibold text-brand-brown-light hover:text-brand-brown"
          >
            {useEmail ? 'Entrar com o código de acesso' : 'Entrar com e-mail'}
          </button>
        )}
      </div>
    </form>
  );
}

// ==========================================
// PRIMEIRO ACESSO: e-mail, WhatsApp, senha e confirmação
// ==========================================

function FirstAccessForm({ tab, onBack }: { tab: Tab; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FirstAccessResult | null>(null);

  function validate() {
    const e: Record<string, string> = {};
    if (!isValidEmail(email)) e.email = 'Informe um e-mail válido.';
    if (!isValidWhatsapp(whatsapp)) e.whatsapp = 'Informe DDD + celular com 9 dígitos. Ex.: (94) 99999-9999';
    if (password.length < 8) e.password = 'A senha deve ter no mínimo 8 caracteres.';
    if (confirmation !== password) e.confirmation = 'As senhas não conferem.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetchApi<FirstAccessResult>('/auth/first-access', {
        method: 'POST',
        skipAuthRedirect: true,
        successToast: false,
        errorToast: false,
        token: '',
        body: JSON.stringify({ tab, email: email.trim(), whatsapp: whatsapp.replace(/\D/g, ''), password, passwordConfirmation: confirmation }),
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
          <p className="text-sm text-brand-brown-light">
            {tab === 'CLIENTE'
              ? 'Use o WhatsApp que você informou na oficina. Enviaremos seu código de acesso para ele.'
              : 'Use o e-mail que o gestor cadastrou para você. O código de acesso chega no seu WhatsApp.'}
          </p>
        </div>
        <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <Input
          label="WhatsApp"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="(94) 99999-9999"
          value={whatsapp}
          onChange={(e) => setWhatsapp(maskWhatsapp(e.target.value))}
          error={errors.whatsapp}
          required
        />
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
        <Button type="submit" block loading={submitting} icon={<KeyRound className="w-4 h-4" aria-hidden />}>
          Criar meu acesso
        </Button>
        <Button variant="ghost" block onClick={onBack}>
          Já tenho código: voltar ao login
        </Button>
      </form>

      {result && (
        <Modal
          title={result.whatsappSent ? 'Credenciais enviadas!' : 'Cadastro concluído'}
          onClose={() => {
            setResult(null);
            onBack();
          }}
        >
          <div className="space-y-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-neon-muted text-neon-deep flex items-center justify-center">
              <MessageCircle className="w-7 h-7" aria-hidden />
            </div>
            {result.whatsappSent ? (
              <p className="text-sm">
                Enviamos seu <strong>código de acesso</strong>, a senha cadastrada e o link de entrada para o WhatsApp{' '}
                <strong>{result.whatsappMasked}</strong>.
              </p>
            ) : (
              <p className="text-sm">
                Seu acesso foi criado, mas não conseguimos enviar o WhatsApp para <strong>{result.whatsappMasked}</strong> agora.
                Peça seu <strong>código de acesso de 4 dígitos</strong> à oficina.
              </p>
            )}
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
