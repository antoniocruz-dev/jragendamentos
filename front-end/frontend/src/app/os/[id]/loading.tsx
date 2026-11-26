import { BrandMark } from '@/components/ui/Brand';

// Boundary de Suspense da rota /os/[id]: a página usa useParams(), que com cacheComponents
// só é resolvido em runtime. Este fallback é o que vai no HTML pré-renderizado.
export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-brand-steel" role="status">
      <BrandMark size={64} className="w-16 h-16 animate-pulse" />
      <span>Carregando Ordem de Serviço...</span>
    </div>
  );
}
