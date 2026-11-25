import { SetMetadata } from '@nestjs/common';

export const MECHANIC_AREA_KEY = 'mechanicArea';
export const ANY_STAFF_KEY = 'anyStaff';

/**
 * Rota do Portal do Mecânico. O perfil Mecânico só acessa rotas com esta marca (e as @AnyStaff);
 * outros perfis da equipe só entram aqui se forem privilegiados (Administrador/Gerente Geral).
 */
export const MechanicArea = () => SetMetadata(MECHANIC_AREA_KEY, true);

/** Rota liberada para qualquer pessoa logada da equipe, inclusive o Mecânico (ex.: /auth/me). */
export const AnyStaff = () => SetMetadata(ANY_STAFF_KEY, true);
