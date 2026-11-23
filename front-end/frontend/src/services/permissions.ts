/**
 * Perfis e módulos (espelho de src/auth/permissions.ts no backend).
 * A regra de verdade está na API; aqui só decidimos o que mostrar.
 */

export type SystemModule = 'DASHBOARD' | 'WORK_ORDERS' | 'CLIENTS' | 'CATALOG' | 'APPOINTMENTS' | 'FINANCIAL';
export type AppModule = SystemModule | 'TEAM';

export type StaffProfile =
  | 'ADMINISTRADOR'
  | 'GERENTE_GERAL'
  | 'MECANICO_CHEFE'
  | 'MECANICO'
  | 'AUXILIAR_OFICINA'
  | 'AUXILIAR_ADMINISTRATIVO';

export const PROFILE_LABELS: Record<StaffProfile, string> = {
  ADMINISTRADOR: 'Administrador',
  GERENTE_GERAL: 'Gerente Geral',
  MECANICO_CHEFE: 'Mecânico Chefe',
  MECANICO: 'Mecânico',
  AUXILIAR_OFICINA: 'Auxiliar de Oficina',
  AUXILIAR_ADMINISTRATIVO: 'Auxiliar Administrativo',
};

export const PROFILE_ORDER = Object.keys(PROFILE_LABELS) as StaffProfile[];

/** Rota de entrada de cada módulo, na ordem de preferência após o login. */
const MODULE_HOME: [AppModule, string][] = [
  ['DASHBOARD', '/'],
  ['WORK_ORDERS', '/work-orders'],
  ['APPOINTMENTS', '/appointments'],
  ['CLIENTS', '/clients'],
  ['CATALOG', '/catalog'],
  ['FINANCIAL', '/financial'],
  ['TEAM', '/team'],
];

/** Módulo necessário para abrir cada página interna. */
export function moduleForPath(pathname: string): AppModule | null {
  if (pathname === '/') return 'DASHBOARD';
  if (pathname.startsWith('/work-orders')) return 'WORK_ORDERS';
  if (pathname.startsWith('/clients')) return 'CLIENTS';
  if (pathname.startsWith('/catalog')) return 'CATALOG';
  if (pathname.startsWith('/appointments')) return 'APPOINTMENTS';
  if (pathname.startsWith('/financial')) return 'FINANCIAL';
  if (pathname.startsWith('/team')) return 'TEAM';
  return null;
}

export function hasModule(modules: string[] | undefined, module: AppModule | null) {
  return module === null || !!modules?.includes(module);
}

/** Primeira página que o usuário pode abrir (usada quando ele não tem o Dashboard). */
export function firstAllowedPath(modules: string[] | undefined): string | null {
  return MODULE_HOME.find(([m]) => modules?.includes(m))?.[1] ?? null;
}
