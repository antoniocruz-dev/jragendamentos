import { clearSession, getToken } from './auth';
import { setApiOnline, toast } from '@/components/feedback';
import { API_BASE_URL } from './api-base';

export { API_BASE_URL };

export interface FetchOptions extends RequestInit {
  token?: string;
  /** Não redireciona para /login em caso de 401 (ex.: a própria tela de login). */
  skipAuthRedirect?: boolean;
  /**
   * Aviso (toast) de sucesso das operações de escrita (POST/PUT/PATCH/DELETE).
   * Padrão: mensagem genérica. Passe um texto para personalizar ou false para não mostrar.
   */
  successToast?: string | false;
  /** Aviso de erro das operações de escrita (padrão: mostra a mensagem da API). */
  errorToast?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- telas antigas ainda consomem o retorno sem tipo
export async function fetchApi<T = any>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token: explicitToken, skipAuthRedirect, successToast, errorToast = true, headers, ...rest } = options;
  // Envia automaticamente o token da sessão da equipe, se houver
  const token = explicitToken ?? getToken();
  const method = (rest.method ?? 'GET').toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...rest,
    });
  } catch (err) {
    // Requisição cancelada de propósito (troca de filtro): não é queda da API
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    setApiOnline(false);
    const message = 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
    if (isMutation && errorToast) toast.error(message);
    throw new ApiError(message, 0);
  }

  // 502/503/504: API ou banco fora do ar (banner); demais respostas confirmam que está no ar
  setApiOnline(![502, 503, 504].includes(response.status));

  // Sessão ausente/expirada em rota protegida: volta para o login
  if (response.status === 401 && !skipAuthRedirect && typeof window !== 'undefined') {
    clearSession();
    const here = window.location.pathname + window.location.search;
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign(`/login?next=${encodeURIComponent(here)}`);
    }
  }

  if (!response.ok) {
    let errorMessage = `Erro HTTP: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // Ignora erro de parse caso a resposta não seja JSON
    }
    const message = Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage;
    if (isMutation && errorToast && response.status !== 401) toast.error(message);
    throw new ApiError(message, response.status);
  }

  if (isMutation && successToast !== false) {
    toast.success(successToast || 'Operação realizada com sucesso.');
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
