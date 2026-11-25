'use client';

import { Gauge } from 'lucide-react';
import { AreaShell, type AreaNavItem } from '@/components/layout/AreaShell';

const NAV: AreaNavItem[] = [{ href: '/mecanico/dashboard', label: 'Minhas O.S', icon: Gauge, matches: ['/mecanico/os'] }];

export default function MecanicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <AreaShell title="Portal do Mecânico" nav={NAV} wide>
      {children}
    </AreaShell>
  );
}
