import {
  Injectable,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SetupAdminDto } from './dto/setup.dto.js';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterUserDto } from './dto/register.dto.js';
import { StaffProfile, UserRole } from '@prisma/client';
import { loadUserModules, roleForProfile } from './permissions.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** Cria um usuário. Com `profile`, o papel técnico (role) é derivado do cargo. */
  async register(dto: RegisterUserDto & { profile?: StaffProfile }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Já existe um usuário cadastrado com este e-mail.');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        phone: dto.phone,
        role: dto.profile ? roleForProfile(dto.profile) : dto.role || UserRole.CLIENT,
        profile: dto.profile ?? null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        profile: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  }

  async isSetupRequired() {
    return (await this.prisma.user.count()) === 0;
  }

  /**
   * Cria o primeiro ADMIN. Recusa se já houver qualquer usuário (evita tomada de controle).
   * Um advisory lock serializa requisições simultâneas: a primeira cria, as outras recebem 403.
   */
  async setupFirstAdmin(dto: SetupAdminDto) {
    if (dto.password.length < 8) {
      throw new UnprocessableEntityException('A senha do administrador deve ter no mínimo 8 caracteres.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('auth_setup'))`;
      if ((await tx.user.count()) > 0) {
        throw new ForbiddenException('O sistema já foi configurado. Faça login com um administrador.');
      }
      await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash,
          phone: dto.phone,
          role: UserRole.ADMIN,
          profile: StaffProfile.ADMINISTRADOR,
        },
      });
    });
    return this.login({ email: dto.email, password: dto.password });
  }

  /**
   * Limite contra força bruta: 5 tentativas de login por minuto por IP (janela fixa guardada no
   * banco, então vale entre as instâncias da Vercel). A 6ª tentativa no minuto recebe 429.
   */
  async assertLoginRateLimit(ip: string | undefined) {
    const key = `login:${(ip || 'desconhecido').slice(0, 100)}`;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "auth_rate_limits" ("key", "window_start", "count")
      VALUES (${key}, now(), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "auth_rate_limits"."window_start" < now() - interval '1 minute' THEN 1 ELSE "auth_rate_limits"."count" + 1 END,
        "window_start" = CASE WHEN "auth_rate_limits"."window_start" < now() - interval '1 minute' THEN now() ELSE "auth_rate_limits"."window_start" END
      RETURNING "count"`;
    if ((rows[0]?.count ?? 0) > 5) {
      throw new HttpException(
        'Muitas tentativas de login. Aguarde 1 minuto e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Mesma mensagem para e-mail inexistente e senha errada (não revela qual dos dois falhou)
    const isPasswordValid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada. Fale com a oficina para reativar o acesso.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const { profile, modules } = await loadUserModules(this.prisma, user.role, user.profile);
    const client =
      user.role === UserRole.CLIENT
        ? await this.prisma.client.findUnique({ where: { userId: user.id }, select: { id: true, name: true } })
        : null;
    if (user.role === UserRole.CLIENT && !client) {
      throw new UnauthorizedException('Este acesso não está vinculado a nenhum cliente. Fale com a oficina.');
    }

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile,
        modules,
        ...(client ? { clientId: client.id } : {}),
      },
    };
  }
}
