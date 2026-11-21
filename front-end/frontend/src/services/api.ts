/**
 * Base das chamadas à API (todas as chamadas são feitas no navegador, em Client Components).
 *
 * - Produção (Vercel Services): front e back no mesmo domínio → caminho relativo "/api".
 *   NÃO defina NEXT_PUBLIC_API_URL na Vercel.
 * - Desenvolvimento: NEXT_PUBLIC_API_URL aponta para a origem do Nest (ex.: http://localhost:3001),
 *   sem "/api" no final; o prefixo é adicionado aqui.
 */
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');

const API_BASE_URL = `${API_ORIGIN.replace(/\/+$/, '')}/api`;

export interface FetchOptions extends RequestInit {
  token?: string;
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...rest,
  });

  if (!response.ok) {
    let errorMessage = `Erro HTTP: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // Ignora erro de parse caso a resposta não seja JSON
    }
    throw new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
