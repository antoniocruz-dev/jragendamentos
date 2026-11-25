import { ObservationAuthorRole, StaffProfile, UserRole } from '@prisma/client';

/**
 * Papéis do SPEC (CLIENTE, MECANICO, GESTOR, ADMIN) sobre o modelo atual (role + cargo):
 * - CLIENTE: role CLIENT
 * - MECANICO: cargo Mecânico (portal próprio, sem dados financeiros)
 * - ADMIN: cargo Administrador
 * - GESTOR: demais cargos da equipe (acesso conforme os módulos do perfil)
 */
export type SpecRole = 'CLIENTE' | 'MECANICO' | 'GESTOR' | 'ADMIN';

export function specRole(user: { role: string; profile?: string | null }): SpecRole {
  if (user.role === UserRole.CLIENT) return 'CLIENTE';
  if (user.profile === StaffProfile.MECANICO) return 'MECANICO';
  if (user.profile === StaffProfile.ADMINISTRADOR || (user.role === UserRole.ADMIN && !user.profile)) return 'ADMIN';
  return 'GESTOR';
}

/** Perfis privilegiados: reabertura ilimitada de OS concluída. */
export const PRIVILEGED_PROFILES: StaffProfile[] = [StaffProfile.ADMINISTRADOR, StaffProfile.GERENTE_GERAL];

export function isPrivileged(user: { profile?: string | null }) {
  return !!user.profile && (PRIVILEGED_PROFILES as string[]).includes(user.profile);
}

/** Cargos que podem ser o mecânico responsável de uma OS. */
export const MECHANIC_PROFILES: StaffProfile[] = [StaffProfile.MECANICO, StaffProfile.MECANICO_CHEFE];

export function isMechanic(user: { role?: string; profile?: string | null } | undefined | null) {
  return !!user && user.role !== UserRole.CLIENT && user.profile === StaffProfile.MECANICO;
}

export function observationRole(user: { role: string; profile?: string | null }): ObservationAuthorRole {
  return specRole(user) as ObservationAuthorRole;
}

/** Telefone BR com DDD: 10 (fixo) ou 11 dígitos (celular). Aceita +55 na frente. */
export function normalizePhone(value: string | undefined | null): string | null {
  let d = (value ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return /^[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(d) ? d : null;
}

/** WhatsApp BR: 11 dígitos (DDD + 9 + número). Aceita +55 na frente. */
export function normalizeWhatsapp(value: string | undefined | null): string | null {
  let d = (value ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  return /^[1-9]{2}9\d{8}$/.test(d) ? d : null;
}
