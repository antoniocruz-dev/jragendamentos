import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { StaffProfile } from '@prisma/client';
import type { AppModule } from '../permissions.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Cargo efetivo (ADMIN antigo sem cargo conta como ADMINISTRADOR) */
  profile: StaffProfile | null;
  /** Módulos liberados para o perfil (inclui TEAM para Administrador/Gerente Geral) */
  modules: AppModule[];
  /** Só no Portal do Cliente: cliente vinculado ao usuário (papel CLIENT) */
  clientId: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
