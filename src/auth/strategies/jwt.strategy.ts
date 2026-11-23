import { getJwtSecret } from '../jwt-secret.js';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { loadUserModules } from '../permissions.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, profile: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Acesso não autorizado: usuário inativo ou inexistente.');
    }

    // Permissões lidas a cada requisição: mudanças de perfil valem imediatamente
    const { profile, modules } = await loadUserModules(this.prisma, user.role, user.profile);
    return { ...user, profile, modules };
  }
}
