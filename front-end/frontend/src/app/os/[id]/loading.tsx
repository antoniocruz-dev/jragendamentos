import { Wrench } from 'lucide-react';

// Boundary de Suspense da rota /os/[id]: a página usa useParams(), que com cacheComponents
// só é resolvido em runtime. Este fallback é o que vai no HTML pré-renderizado.
export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-400">
      <Wrench className="w-8 h-8 text-amber-500 animate-spin" />
      <span>Carregando Ordem de Serviço...</span>
    </div>
  );
}
