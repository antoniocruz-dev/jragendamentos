import { StaffProfile, UserRole } from '@prisma/client';

/** Módulos do sistema que podem ser liberados por perfil (checkboxes da tela Equipe). */
export const SYSTEM_MODULES = [
  'DASHBOARD',
  'WORK_ORDERS',
  'CLIENTS',
  'CATALOG',
  'APPOINTMENTS',
  'FINANCIAL',
] as const;
export type SystemModule = (typeof SYSTEM_MODULES)[number];

/**
 * Módulo especial: gestão da equipe e configuração de perfis.
 * Não é configurável: pertence sempre (e só) a ADMINISTRADOR e GERENTE_GERAL.
 */
export const TEAM_MODULE = 'TEAM';
export type AppModule = SystemModule | typeof TEAM_MODULE;

export const MODULE_LABELS: Record<SystemModule, string> = {
  DASHBOARD: 'Dashboard',
  WORK_ORDERS: 'Ordens de Serviço',
  CLIENTS: 'Clientes & Veículos',
  CATALOG: 'Peças & Serviços',
  APPOINTMENTS: 'Agendamentos',
  FINANCIAL: 'Financeiro',
};

export const PROFILE_LABELS: Record<StaffProfile, string> = {
  ADMINISTRADOR: 'Administrador',
  GERENTE_GERAL: 'Gerente Geral',
  MECANICO_CHEFE: 'Mecânico Chefe',
  MECANICO: 'Mecânico',
  AUXILIAR_OFICINA: 'Auxiliar de Oficina',
  AUXILIAR_ADMINISTRATIVO: 'Auxiliar Administrativo',
};

/** Ordem de exibição dos perfis na tela. */
export const PROFILE_ORDER: StaffProfile[] = [
  StaffProfile.ADMINISTRADOR,
  StaffProfile.GERENTE_GERAL,
  StaffProfile.MECANICO_CHEFE,
  StaffProfile.MECANICO,
  StaffProfile.AUXILIAR_OFICINA,
  StaffProfile.AUXILIAR_ADMINISTRATIVO,
];

/** Perfis que podem cadastrar usuários e configurar perfis. */
export const TEAM_MANAGER_PROFILES: StaffProfile[] = [
  StaffProfile.ADMINISTRADOR,
  StaffProfile.GERENTE_GERAL,
];

export function isSystemModule(value: string): value is SystemModule {
  return (SYSTEM_MODULES as readonly string[]).includes(value);
}

/**
 * Perfil efetivo: usuários antigos com role ADMIN e sem perfil contam como ADMINISTRADOR.
 */
export function effectiveProfile(role: UserRole | string, profile: StaffProfile | null | undefined) {
  if (profile) return profile;
  return role === UserRole.ADMIN ? StaffProfile.ADMINISTRADOR : null;
}

/** Papel técnico (role) correspondente ao perfil escolhido no cadastro. */
export function roleForProfile(profile: StaffProfile): UserRole {
  return profile === StaffProfile.ADMINISTRADOR ? UserRole.ADMIN : UserRole.OPERATOR;
}

/** Busca a configuração do perfil no banco e devolve os módulos efetivos do usuário. */
export async function loadUserModules(
  prisma: { profilePermission: { findUnique: (args: { where: { profile: StaffProfile } }) => Promise<{ modules: string[] } | null> } },
  role: UserRole | string,
  profile: StaffProfile | null | undefined,
): Promise<{ profile: StaffProfile | null; modules: AppModule[] }> {
  const eff = effectiveProfile(role, profile);
  if (!eff) return { profile: null, modules: [] };
  if (eff === StaffProfile.ADMINISTRADOR) return { profile: eff, modules: resolveModules(eff, []) };

  const perm = await prisma.profilePermission.findUnique({ where: { profile: eff } });
  return { profile: eff, modules: resolveModules(eff, perm?.modules) };
}

/**
 * Lista final de módulos de um usuário:
 * - ADMINISTRADOR: todos + TEAM
 * - GERENTE_GERAL: os configurados + TEAM
 * - demais: só os configurados
 */
export function resolveModules(profile: StaffProfile | null, configured: string[] | undefined): AppModule[] {
  if (!profile) return [];
  if (profile === StaffProfile.ADMINISTRADOR) return [...SYSTEM_MODULES, TEAM_MODULE];

  const modules: AppModule[] = (configured ?? []).filter(isSystemModule);
  if (TEAM_MANAGER_PROFILES.includes(profile)) modules.push(TEAM_MODULE);
  return modules;
}
