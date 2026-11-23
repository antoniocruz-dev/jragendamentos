import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

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

    const user = context.switchToHttp().getRequest().user as { role?: string } | undefined;
    if (!user?.role || !STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException('Acesso restrito à equipe da oficina.');
    }
    return true;
  }
}
