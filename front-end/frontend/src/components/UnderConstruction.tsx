'use client';

import React from 'react';
import Link from 'next/link';
import { Construction, ArrowLeft } from 'lucide-react';

interface UnderConstructionProps {
  title: string;
  description?: string;
}

export default function UnderConstruction({ 
  title, 
  description = 'Estamos preparando este módulo para você gerenciar sua oficina com total controle.' 
}: UnderConstructionProps) {
  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 p-8 rounded-2xl text-center shadow-xl">
        
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Construction className="w-8 h-8 text-amber-500 animate-pulse" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">{title}</h1>

        {/* Mensagem Adaptativa: Desktop vs Mobile */}
        <div className="my-4">
          <p className="hidden md:block text-slate-300 text-sm">
            Esta página ainda está em desenvolvimento.
          </p>
          <p className="block md:hidden text-amber-400 text-base font-semibold">
            Página em construção 🔧
          </p>
          
          <p className="text-xs text-slate-500 mt-2">
            {description}
          </p>
        </div>

        <div className="pt-6 border-t border-slate-800">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Dashboard Principal
          </Link>
        </div>
      </div>
    </div>
  );
}
