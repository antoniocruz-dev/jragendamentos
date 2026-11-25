/**
 * Base das chamadas à API.
 * - Produção (Vercel Services): front e back no mesmo domínio → caminho relativo "/api".
 *   NÃO defina NEXT_PUBLIC_API_URL na Vercel.
 * - Desenvolvimento: NEXT_PUBLIC_API_URL aponta para a origem do Nest (ex.: http://localhost:3001),
 *   sem "/api" no final; o prefixo é adicionado aqui.
 */
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');

export const API_BASE_URL = `${API_ORIGIN.replace(/\/+$/, '')}/api`;
