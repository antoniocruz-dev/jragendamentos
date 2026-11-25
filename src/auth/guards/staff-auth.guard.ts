import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { REQUIRED_MODULES_KEY } from '../decorators/require-modules.decorator.js';
import { MANAGERS_ONLY_KEY } from '../decorators/managers-only.decorator.js';
import { CLIENT_PORTAL_KEY } from '../decorators/client-portal.decorator.js';
import { TEAM_MANAGER_PROFILES } from '../permissions.js';
import { ANY_STAFF_KEY, MECHANIC_AREA_KEY } from '../decorators/mechanic-area.decorator.js';
import { isMechanic, isPrivileged } from '../../common/roles.js';

/** Perfis da equipe da oficina que podem usar o sistema interno. */
const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.OPERATOR];

/**
 * Guard global (registrado como APP_GUARD): toda rota exige um JWT válido de
 * um usuário da equipe (ADMIN ou OPERATOR), exceto as marcadas com @Public().
 */
@Injectable()
export class StaffAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Valida o token (lança 401 se ausente/inválido/expirado)
    await super.canActivate(context);

    const user = context.switchToHttp().getRequest().user as
      | { role?: string; profile?: string | null; modules?: string[] }
      | undefined;

    // Portal do Cliente: rotas exclusivas do papel CLIENT (dados filtrados pelo cliente do token)
    const isPortal = this.reflector.getAllAndOverride<boolean>(CLIENT_PORTAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPortal) {
      if (user?.role !== UserRole.CLIENT) throw new ForbiddenException('Área exclusiva do Portal do Cliente.');
      return true;
    }

    if (!user?.role || !STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException('Acesso restrito à equipe da oficina.');
    }

    const meta = (key: string) => this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]);

    // Portal do Mecânico: o Mecânico só usa as rotas dele (nunca vê valores, custos ou faturamento)
    if (meta(MECHANIC_AREA_KEY)) {
      if (!isMechanic(user) && !isPrivileged(user ?? {})) {
        throw new ForbiddenException('Área exclusiva do Portal do Mecânico.');
      }
      return true;
    }
    if (isMechanic(user)) {
      if (meta(ANY_STAFF_KEY)) return true;
      throw new ForbiddenException('Perfil Mecânico: use o Portal do Mecânico.');
    }

    // Permissão por módulo (definida pelo perfil do usuário)
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_MODULES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.some((m) => user.modules?.includes(m))) {
      throw new ForbiddenException('Seu perfil não tem acesso a este módulo.');
    }

    // Excluir/inativar cadastros: só Administrador e Gerente Geral
    const managersOnly = this.reflector.getAllAndOverride<boolean>(MANAGERS_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (managersOnly && !(TEAM_MANAGER_PROFILES as string[]).includes(user.profile ?? '')) {
      throw new ForbiddenException('Somente Administrador ou Gerente Geral podem excluir ou inativar cadastros.');
    }
    return true;
  }
}
