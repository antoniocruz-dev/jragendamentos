'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Wrench } from 'lucide-react';
import { clearSession, useAuth } from '@/services/auth';
import { cn } from '@/lib/cn';

export interface AreaNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Também fica ativo nestes prefixos (ex.: detalhe da O.S) */
  matches?: string[];
}

function isActive(pathname: string, item: AreaNavItem) {
  const prefixes = [item.href, ...(item.matches ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function logout() {
  clearSession();
  window.location.assign('/login');
}

/**
 * Layout mobile das áreas Cliente e Mecânico:
 * - MobileHeader fixo no topo (marca + usuário; do md em diante também o menu);
 * - BottomNavigation fixa embaixo no celular/tablet, com "Sair" sempre visível.
 */
export function AreaShell({ title, nav, children, wide = false }: { title: string; nav: AreaNavItem[]; children: React.ReactNode; wide?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <div data-area className="min-h-dvh bg-surface-offwhite text-brand-brown-dark">
      <header className="sticky top-0 z-40 bg-brand-brown-dark text-white shadow-md pt-[env(safe-area-inset-top)]">
        <div className={cn('mx-auto flex items-center gap-3 px-4 h-14', wide ? 'max-w-5xl' : 'max-w-3xl')}>
          <div className="w-9 h-9 rounded-xl bg-neon-primary text-brand-brown-dark flex items-center justify-center shrink-0" aria-hidden>
            <Wrench className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[11px] uppercase tracking-widest text-neon-soft font-bold">{title}</p>
            <p className="text-sm font-semibold truncate">{firstName ? `Olá, ${firstName}` : 'JR Garage Center'}</p>
          </div>
          <nav aria-label="Menu" className="hidden md:flex items-center gap-1">
            {nav.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'min-h-11 px-3 inline-flex items-center gap-2 rounded-xl text-sm font-semibold transition-colors',
                    active ? 'bg-neon-primary text-brand-brown-dark' : 'text-white/85 hover:bg-white/10',
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            <button onClick={logout} className="min-h-11 px-3 inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-white/85 hover:bg-white/10">
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </nav>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-5 sm:py-8 pb-28 md:pb-10', wide ? 'max-w-5xl' : 'max-w-3xl')}>{children}</main>

      <nav
        data-bottom-nav
        aria-label="Navegação principal"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-white border-t border-brand-brown-light/30 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(78,52,46,0.08)]"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${nav.length + 1}, minmax(0, 1fr))` }}>
          {nav.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-0.5 min-h-16 text-[11px] font-semibold transition-colors',
                    active ? 'text-brand-brown-dark' : 'text-brand-brown-light',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-0 h-1 w-10 rounded-b-full bg-neon-primary transition-opacity duration-200',
                      active ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <item.icon className="w-6 h-6" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={logout}
              className="w-full flex flex-col items-center justify-center gap-0.5 min-h-16 text-[11px] font-semibold text-brand-brown-light"
            >
              <LogOut className="w-6 h-6" />
              Sair
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** Título de página das áreas claras. */
export function AreaTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold text-brand-brown-dark">{title}</h1>
        {subtitle && <p className="text-sm text-brand-brown-light mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
