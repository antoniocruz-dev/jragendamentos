'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { AppModule, StaffProfile } from './permissions';

/**
 * Sessão da equipe da oficina (token JWT + dados do usuário) guardada no navegador.
 * O backend exige esse token em todas as rotas, exceto as públicas (login e link da OS).
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  profile: StaffProfile | null;
  /** Módulos liberados pelo perfil (a API recalcula a cada requisição) */
  modules: AppModule[];
  /** Portal do Cliente: cliente vinculado ao login (papel CLIENT) */
  clientId?: string;
  /** Papel do SPEC: CLIENTE, MECANICO, GESTOR ou ADMIN */
  specRole?: 'CLIENTE' | 'MECANICO' | 'GESTOR' | 'ADMIN';
  /** Código de acesso de 4 dígitos */
  accessCode?: string;
}

export const isClientUser = (u: { role?: string } | null | undefined) => u?.role === 'CLIENT';
/** Perfil Mecânico: usa só o Portal do Mecânico */
export const isMechanicUser = (u: { role?: string; profile?: string | null } | null | undefined) =>
  !!u && u.role !== 'CLIENT' && u.profile === 'MECANICO';

/** Tela inicial de cada tipo de usuário */
export const CLIENT_HOME = '/cliente';
export const MECHANIC_HOME = '/mecanico/dashboard';

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

const STORAGE_KEY = 'jr_auth';
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function notify() {
  listeners.forEach((l) => l());
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = readRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.accessToken ?? null;
}

export function saveSession(session: AuthSession) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Navegação privada / storage bloqueado: a sessão dura só até recarregar
  }
  notify();
}

/** Atualiza só os dados do usuário (perfil/módulos), mantendo o token. */
export function updateSessionUser(user: AuthUser) {
  const current = getSession();
  if (!current) return;
  if (JSON.stringify(current.user) === JSON.stringify(user)) return;
  saveSession({ ...current, user });
}

export function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Mantém abas diferentes sincronizadas (login/logout em outra aba)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Hook da sessão. `ready` é false durante o prerender/primeira renderização no servidor,
 * quando ainda não dá para saber se há login (localStorage só existe no navegador).
 */
export function useAuth() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined as unknown as string | null);
  const ready = raw !== undefined;

  const session = useMemo<AuthSession | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthSession;
    } catch {
      return null;
    }
  }, [raw]);

  return { ready, session, user: session?.user ?? null, isAuthenticated: !!session?.accessToken };
}

/** Administrador e Gerente Geral: atribuem e trocam o mecânico responsável da OS. */
export const isPrivilegedUser = (u: { role?: string; profile?: string | null } | null | undefined) =>
  !!u && u.role !== 'CLIENT' && (u.profile === 'ADMINISTRADOR' || u.profile === 'GERENTE_GERAL');
