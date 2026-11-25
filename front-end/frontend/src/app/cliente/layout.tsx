'use client';

import { CalendarPlus, ClipboardList } from 'lucide-react';
import { AreaShell, type AreaNavItem } from '@/components/layout/AreaShell';

const NAV: AreaNavItem[] = [
  { href: '/cliente', label: 'Início / O.S', icon: ClipboardList, matches: ['/cliente/os'] },
  { href: '/cliente/agendamento', label: 'Agendar', icon: CalendarPlus },
];

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AreaShell title="Área do Cliente" nav={NAV}>
      {children}
    </AreaShell>
  );
}
