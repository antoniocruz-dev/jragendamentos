'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Wrench,
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  Users,
  Package,
  Calendar,
  DollarSign,
  Menu,
  X,
  LogOut,
  UserCog,
  Home,
} from 'lucide-react';
import type { AppModule } from '@/services/permissions';
import { useAuth, clearSession, isClientUser } from '@/services/auth';
import { BrandMark, BrandName } from '@/components/ui/Brand';
import { isOwnLayoutPath, isPublicPath } from '@/components/AuthGate';

type NavItem = { name: string; short: string; href: string; icon: typeof Wrench; module: AppModule };

const navItems: NavItem[] = [
  { name: 'Dashboard', short: 'Início', href: '/', icon: LayoutDashboard, module: 'DASHBOARD' },
  { name: 'Ordens de Serviço', short: 'OS', href: '/work-orders', icon: ClipboardList, module: 'WORK_ORDERS' },
  { name: 'Nova OS', short: 'Nova OS', href: '/work-orders/new', icon: PlusCircle, module: 'WORK_ORDERS' },
  { name: 'Agendamentos', short: 'Agenda', href: '/appointments', icon: Calendar, module: 'APPOINTMENTS' },
  { name: 'Clientes & Veículos', short: 'Clientes', href: '/clients', icon: Users, module: 'CLIENTS' },
  { name: 'Peças & Serviços', short: 'Catálogo', href: '/catalog', icon: Package, module: 'CATALOG' },
  { name: 'Financeiro', short: 'Financeiro', href: '/financial', icon: DollarSign, module: 'FINANCIAL' },
  { name: 'Equipe', short: 'Equipe', href: '/team', icon: UserCog, module: 'TEAM' },
];

/** Item ativo = o de href mais longo que casa com a rota (evita "OS" e "Nova OS" ativos juntos). */
function activeHref(pathname: string, items: NavItem[]) {
  let best: string | null = null;
  for (const it of items) {
    const match = it.href === '/' ? pathname === '/' : pathname === it.href || pathname.startsWith(`${it.href}/`);
    if (match && (!best || it.href.length > best.length)) best = it.href;
  }
  return best;
}

/**
 * Navegação mobile first:
 * - celular/tablet (< lg): barra superior fixa + barra inferior com até 4 atalhos e "Menu" (gaveta com tudo);
 * - notebook (lg): menu horizontal só com ícones; desktop (xl+): ícones com rótulos curtos.
 * A barra inferior tem largura fixa por item, então não "quebra" em telas estreitas (320px+).
 */
export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  // Fecha a gaveta com Esc e trava a rolagem do fundo enquanto ela está aberta
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  // Oculta a navegação administrativa na página pública do cliente (/os/[id]) e no login
  if (isPublicPath(pathname) || isOwnLayoutPath(pathname)) return null;

  // Cliente: só o próprio portal
  const visibleItems = isClientUser(user)
    ? [{ name: 'Minha área', short: 'Início', href: '/cliente', icon: Home, module: 'DASHBOARD' as AppModule }]
    : navItems.filter((item) => user?.modules?.includes(item.module));
  const current = activeHref(pathname, visibleItems);
  const bottomItems = visibleItems.slice(0, 4);
  const firstName = user?.name.split(' ')[0] ?? '';

  function handleLogout() {
    clearSession();
    window.location.assign('/login');
  }

  return (
    <>
      <header className="brand-header text-white shadow-md sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 flex items-center justify-between gap-3 h-14 lg:h-16">
          <Link href={isClientUser(user) ? '/cliente' : '/'} className="flex items-center gap-2.5 min-w-0">
            <BrandMark size={40} className="w-9 h-9 lg:w-10 lg:h-10" />
            <BrandName className="text-base lg:text-lg" />
          </Link>

          {/* Notebook/desktop: menu horizontal */}
          <nav className="hidden lg:flex items-center gap-0.5" aria-label="Menu principal">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = current === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.name}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive ? 'bg-neon-primary text-brand-ink' : 'text-white/85 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden xl:inline">{item.short}</span>
                </Link>
              );
            })}
            {user && (
              <button
                onClick={handleLogout}
                title={`Sair (${user.email})`}
                className="ml-1 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-white/85 hover:text-white hover:bg-white/10"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden xl:inline">{firstName} · Sair</span>
              </button>
            )}
          </nav>

          {/* Celular/tablet: botão da gaveta */}
          <button
            onClick={() => setIsOpen(true)}
            className="lg:hidden shrink-0 text-white p-2.5 -mr-2 rounded-lg hover:bg-white/10"
            aria-label="Abrir menu"
            aria-expanded={isOpen}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Celular/tablet: barra inferior fixa */}
      {visibleItems.length > 0 && (
        <nav
          data-bottom-nav
          aria-label="Atalhos"
          className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-surface-white border-t border-brand-steel/30 shadow-[0_-4px_16px_rgba(11,14,12,0.10)] pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-5 max-w-lg mx-auto h-16">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = current === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center gap-1 min-w-0 px-1 text-[11px] font-semibold ${
                    isActive ? 'text-brand-ink' : 'text-brand-steel active:text-brand-ink'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-0 h-1 w-10 rounded-b-full bg-neon-primary transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <Icon className="w-5 h-5" />
                  <span className="truncate max-w-full">{item.short}</span>
                </Link>
              );
            })}
            {/* Mantém "Menu" sempre na 5ª coluna, mesmo com menos atalhos */}
            {Array.from({ length: 4 - bottomItems.length }).map((_, i) => (
              <span key={`gap-${i}`} aria-hidden />
            ))}
            <button
              onClick={() => setIsOpen(true)}
              className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-brand-steel active:text-brand-ink"
              aria-label="Abrir menu completo"
            >
              <Menu className="w-5 h-5" />
              Menu
            </button>
          </div>
        </nav>
      )}

      {/* Gaveta com todos os módulos */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-brand-ink/50 backdrop-blur-[2px]" aria-label="Fechar menu" onClick={() => setIsOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-[82%] max-w-xs bg-surface-white shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 h-14 brand-header text-white">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{user?.name}</div>
                <div className="text-xs text-neon-soft truncate">
                  {user?.accessCode ? `Código ${user.accessCode} · ` : ''}
                  {user?.email}
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2.5 -mr-2 text-white hover:bg-white/10 rounded-lg" aria-label="Fechar menu">
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Todos os módulos">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = current === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium ${
                      isActive ? 'bg-neon-primary text-brand-ink font-bold' : 'text-brand-graphite hover:bg-surface-muted hover:text-brand-ink'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="p-3 border-t border-line-soft">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-rose-700 hover:bg-rose-500/10"
                >
                  <LogOut className="w-5 h-5" />
                  Sair
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
