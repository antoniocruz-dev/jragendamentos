import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
//import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AuthGate from '@/components/AuthGate';
import { ConnectionBanner, Toaster } from '@/components/feedback';

//const inter = Inter({ subsets: ['latin'] });

// As páginas internas só renderizam depois que o AuthGate confirma a sessão (guardada no
// navegador), então não há como validar "instant navigation" no prerender. Opt-out indicado
// pelo guia "authentication-with-cache-components"; o prerender e o streaming continuam iguais.
export const instant = false;

export const metadata: Metadata = {
  title: 'JR Agendamentos | Gestão de Oficina Mecânica',
  description: 'Sistema Operacional e Financeiro para Oficinas Mecânicas',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0d0b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className="bg-surface-offwhite text-brand-ink flex flex-col min-h-screen antialiased">
        {/* Navbar/Footer usam usePathname(): com cacheComponents, em rotas com parâmetro dinâmico
            (ex.: /os/[id]) o pathname só existe em runtime e exige um Suspense, senão o build falha.
            Em rotas estáticas o pathname é resolvido no prerender e o fallback nem aparece. */}
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
        <Suspense fallback={null}>
          <ConnectionBanner />
        </Suspense>
        <main className="flex-1 min-w-0">
          {/* AuthGate usa usePathname(): mesmo motivo do Suspense acima */}
          <Suspense fallback={null}>
            <AuthGate>{children}</AuthGate>
          </Suspense>
        </main>
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
