'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Code2, ShieldCheck } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();

  // Oculta o rodapé na tela pública do cliente (/os/[id])
  if (pathname.startsWith('/os/') || pathname === '/login' || /^\/(cliente|mecanico|portal)(\/|$)/.test(pathname)) {
    return null;
  }

  return (
    <footer className="bg-surface-offwhite border-t border-line-soft/80 text-brand-graphite py-8 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        
        {/* Identificação do Sistema */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-brand-graphite">JR Agendamentos</span>
          <span>•</span>
          <span>Sistema Integrado de Gestão para Oficinas Mecânicas</span>
        </div>

        {/* Assinatura Wolf */}
        <div className="bg-surface-white border border-line-soft px-4 py-2.5 rounded-xl flex items-center gap-2.5 shadow-sm text-brand-graphite">
          <Code2 className="w-4 h-4 text-neon-deep" />
          <span>
            Desenvolvido por{' '}
            <strong className="text-brand-ink font-bold tracking-wide">
              Wolf - Arquitetura e Desenvolvimento de Softwares
            </strong>
          </span>
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
        </div>

      </div>
    </footer>
  );
}
