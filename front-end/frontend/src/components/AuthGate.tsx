'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wrench, ShieldOff } from 'lucide-react';
import { useAuth, updateSessionUser, isClientUser, type AuthUser } from '@/services/auth';
import { fetchApi } from '@/services/api';
import { firstAllowedPath, hasModule, moduleForPath } from '@/services/permissions';

/** Rotas acessíveis sem login: a tela de login e o link da OS enviado ao cliente. */
export function isPublicPath(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/os/');
}

/**
 * Protege as páginas internas:
 * - sem sessão da equipe → /login
 * - sem o módulo da página no perfil → aviso (ou a primeira página permitida, no caso do Dashboard)
 * A proteção real está na API; isto evita telas vazias e chamadas que dariam 401/403.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, isAuthenticated, user } = useAuth();
  const isPublic = isPublicPath(pathname);
  const mustLogin = ready && !isPublic && !isAuthenticated;

  // Portal do Cliente: o cliente só usa /portal; a equipe não usa o portal
  const isClient = isClientUser(user);
  const isPortalPath = pathname === '/portal' || pathname.startsWith('/portal/');
  const requiredModule = moduleForPath(pathname);
  const allowed = isClient ? isPortalPath : !isPortalPath && hasModule(user?.modules, requiredModule);
  // Quem não tem Dashboard cai direto na primeira tela permitida (cliente: no portal)
  const fallbackPath = !allowed && (pathname === '/' || isClient) ? (isClient ? '/portal' : firstAllowedPath(user?.modules)) : null;

  useEffect(() => {
    if (mustLogin) {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [mustLogin]);

  useEffect(() => {
    if (fallbackPath) window.location.replace(fallbackPath);
  }, [fallbackPath]);

  // Atualiza perfil/módulos uma vez por carregamento (o gestor pode ter mudado as permissões)
  useEffect(() => {
    if (!isAuthenticated || isClient) return;
    fetchApi<AuthUser>('/auth/me')
      .then(updateSessionUser)
      .catch(() => {
        // 401 já redireciona para o login dentro do fetchApi
      });
  }, [isAuthenticated, isClient]);

  if (isPublic) return <>{children}</>;

  if (!ready || !isAuthenticated || fallbackPath) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-400">
        <Wrench className="w-8 h-8 text-amber-500 animate-spin" />
        <span>Verificando acesso...</span>
      </div>
    );
  }

  if (!allowed) {
    const home = firstAllowedPath(user?.modules);
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-sm text-center bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-3">
          <ShieldOff className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-bold text-white">Sem acesso a este módulo</h1>
          <p className="text-sm text-slate-400">
            Seu perfil não tem permissão para esta tela. Fale com o Administrador ou o Gerente Geral.
          </p>
          {home && (
            <Link href={home} className="inline-block text-sm font-semibold text-amber-400 hover:text-amber-300">
              Ir para a minha tela inicial
            </Link>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
