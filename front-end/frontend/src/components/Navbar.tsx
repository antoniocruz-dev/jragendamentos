'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import type { AppModule } from '@/services/permissions';
import { useAuth, clearSession } from '@/services/auth';
import { isPublicPath } from '@/components/AuthGate';

const navItems: { name: string; href: string; icon: typeof Wrench; module: AppModule }[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, module: 'DASHBOARD' },
  { name: 'Ordens de Serviço', href: '/work-orders', icon: ClipboardList, module: 'WORK_ORDERS' },
  { name: 'Nova OS', href: '/work-orders/new', icon: PlusCircle, module: 'WORK_ORDERS' },
  { name: 'Clientes & Veículos', href: '/clients', icon: Users, module: 'CLIENTS' },
  { name: 'Peças & Serviços', href: '/catalog', icon: Package, module: 'CATALOG' },
  { name: 'Agendamentos', href: '/appointments', icon: Calendar, module: 'APPOINTMENTS' },
  { name: 'Financeiro', href: '/financial', icon: DollarSign, module: 'FINANCIAL' },
  { name: 'Equipe', href: '/team', icon: UserCog, module: 'TEAM' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const { user } = useAuth();

  // Oculta a navegação administrativa na página pública do cliente (/os/[id]) e no login
  if (isPublicPath(pathname)) {
    return null;
  }

  // Só os módulos liberados para o perfil do usuário
  const visibleItems = navItems.filter((item) => user?.modules?.includes(item.module));

  function handleLogout() {
    clearSession();
    window.location.assign('/login');
  }

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo da Oficina */}
          <Link href="/" className="flex items-center gap-3">
            <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded-xl text-amber-500">
              <Wrench className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-lg text-white tracking-tight">
              JR <span className="text-amber-500">Agendamentos</span>
            </span>
          </Link>

          {/* Menu Horizontal para Desktop */}
          <div className="hidden xl:flex items-center gap-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
            {user && (
              <button
                onClick={handleLogout}
                title={`Sair (${user.email})`}
                className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <LogOut className="w-4 h-4" />
                {user.name.split(' ')[0]} · Sair
              </button>
            )}
          </div>

          {/* Botão Hambúrguer Mobile */}
          <div className="xl:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 focus:outline-none"
              aria-label="Alternar menu de navegação"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Colapsado Mobile */}
      {isOpen && (
        <div className="xl:hidden bg-slate-950/95 border-b border-slate-800 px-4 pt-2 pb-5 space-y-1.5 backdrop-blur-md">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
          {user && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sair ({user.name})
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
