'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { useAuth } from '@/services/auth';

/** Rotas acessíveis sem login: a tela de login e o link da OS enviado ao cliente. */
export function isPublicPath(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/os/');
}

/**
 * Protege as páginas internas: sem sessão da equipe, redireciona para /login.
 * (A proteção real está na API; isto evita mostrar telas vazias e chamadas que dariam 401.)
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, isAuthenticated } = useAuth();
  const isPublic = isPublicPath(pathname);
  const mustRedirect = ready && !isPublic && !isAuthenticated;

  useEffect(() => {
    if (mustRedirect) {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [mustRedirect]);

  if (isPublic) return <>{children}</>;

  if (!ready || !isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-400">
        <Wrench className="w-8 h-8 text-amber-500 animate-spin" />
        <span>Verificando acesso...</span>
      </div>
    );
  }

  return <>{children}</>;
}
