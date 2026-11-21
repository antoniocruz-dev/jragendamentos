import { Suspense } from 'react';
import type { Metadata } from 'next';
//import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

//const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'JR Agendamentos | Gestão de Oficina Mecânica',
  description: 'Sistema Operacional e Financeiro para Oficinas Mecânicas',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className="bg-slate-950 text-slate-100 flex flex-col min-h-screen antialiased">
        {/* Navbar/Footer usam usePathname(): com cacheComponents, em rotas com parâmetro dinâmico
            (ex.: /os/[id]) o pathname só existe em runtime e exige um Suspense, senão o build falha.
            Em rotas estáticas o pathname é resolvido no prerender e o fallback nem aparece. */}
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </body>
    </html>
  );
}
