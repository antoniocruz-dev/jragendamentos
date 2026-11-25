/** Paginação das listagens (grids). Limites protegem o banco de consultas sem teto. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export const MAX_PAGE_SIZE = 100;

export function parsePage(page?: string, pageSize?: string, defaultSize = 20) {
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize)) || defaultSize));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Normaliza o termo de busca: texto livre, só dígitos (CPF/telefone/nº OS) e placa (A-Z0-9). */
export function searchTerms(q?: string) {
  const text = (q ?? '').trim().slice(0, 80);
  return {
    text,
    digits: text.replace(/\D/g, ''),
    plate: text.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  };
}
