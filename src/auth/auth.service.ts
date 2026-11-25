import {
  Injectable,
  NotFoundException,
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
import { randomBytes } from 'crypto';
import { FirstAccessDto } from './dto/first-access.dto.js';
import { WhatsappService } from '../notifications/whatsapp.service.js';
import { normalizeWhatsapp, specRole } from '../common/roles.js';

/** Limite contra força bruta: 5 tentativas FALHAS por IP e por código a cada 15 minutos. */
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;

export function appPublicUrl() {
  return (process.env.APP_PUBLIC_URL || 'https://app.jrgaragecenter.com.br').replace(/\/$/, '');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Cria um usuário. Com `profile`, o papel técnico (role) é derivado do cargo. */
  async register(dto: Omit<RegisterUserDto, 'password'> & { password?: string; profile?: StaffProfile; whatsapp?: string }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Já existe um usuário cadastrado com este e-mail.');
    }

    // Sem senha: conta da equipe aguardando o "primeiro acesso" (a pessoa define a senha e recebe o código)
    const pending = !dto.password;
    const passwordHash = await bcrypt.hash(dto.password || randomBytes(24).toString('hex'), 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        phone: dto.phone,
        whatsapp: normalizeWhatsapp(dto.whatsapp ?? dto.phone),
        firstAccessPending: pending,
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
        accessCode: true,
        whatsapp: true,
        firstAccessPending: true,
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
   * Conta uma tentativa na janela de 15 min (guardada no banco: vale entre as instâncias da Vercel).
   * Devolve o total de tentativas na janela, já contando esta.
   */
  private async hit(key: string) {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "auth_rate_limits" ("key", "window_start", "count")
      VALUES (${key}, now(), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "auth_rate_limits"."window_start" < now() - make_interval(mins => ${LOGIN_WINDOW_MINUTES}::int) THEN 1 ELSE "auth_rate_limits"."count" + 1 END,
        "window_start" = CASE WHEN "auth_rate_limits"."window_start" < now() - make_interval(mins => ${LOGIN_WINDOW_MINUTES}::int) THEN now() ELSE "auth_rate_limits"."window_start" END
      RETURNING "count"`;
    return rows[0]?.count ?? 0;
  }

  /** Tentativa que deu certo não conta como falha. */
  private async release(key: string) {
    await this.prisma.$executeRaw`UPDATE "auth_rate_limits" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ${key}`;
  }

  private tooMany() {
    return new HttpException(
      `Muitas tentativas sem sucesso. Aguarde ${LOGIN_WINDOW_MINUTES} minutos e tente novamente.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Login com limite de 5 falhas por IP e por código (ou e-mail) a cada 15 minutos.
   * Cada tentativa é contada antes da verificação (atômico entre requisições simultâneas)
   * e devolvida se o login der certo: na prática, só as falhas contam.
   */
  async loginWithRateLimit(dto: LoginDto, ip: string | undefined) {
    const ident = dto.accessCode ? `code:${dto.accessCode}` : `email:${(dto.email ?? '').toLowerCase().slice(0, 100)}`;
    const keys = [`login:ip:${(ip || 'desconhecido').slice(0, 90)}`, `login:${ident}`];
    const counts = await Promise.all(keys.map((k) => this.hit(k)));
    if (counts.some((c) => c > LOGIN_MAX_FAILURES)) throw this.tooMany();
    const session = await this.login(dto);
    await Promise.all(keys.map((k) => this.release(k)));
    return session;
  }

  async login(dto: LoginDto) {
    if (!dto.accessCode && !dto.email) {
      throw new UnauthorizedException('Informe o código de acesso e a senha.');
    }
    const user = dto.accessCode
      ? await this.prisma.user.findUnique({ where: { accessCode: dto.accessCode } })
      : await this.prisma.user.findUnique({ where: { email: dto.email!.toLowerCase() } });

    // Mesma mensagem para código inexistente e senha errada (não revela qual dos dois falhou)
    const isPasswordValid = user && !user.firstAccessPending ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException(dto.accessCode ? 'Código de acesso ou senha inválidos.' : 'E-mail ou senha inválidos.');
    }
    // Aba errada (só depois da senha válida, para não revelar o tipo da conta)
    if (dto.tab === 'CLIENTE' && user.role !== UserRole.CLIENT) {
      throw new UnauthorizedException('Este código é da equipe da oficina. Use a aba "Equipe".');
    }
    if (dto.tab === 'EQUIPE' && user.role === UserRole.CLIENT) {
      throw new UnauthorizedException('Este código é de cliente. Use a aba "Cliente".');
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
        specRole: specRole({ role: user.role, profile }),
        accessCode: user.accessCode,
        profile,
        modules,
        ...(client ? { clientId: client.id } : {}),
      },
    };
  }

  // ==========================================
  // PRIMEIRO ACESSO
  // ==========================================

  /**
   * Primeiro acesso (público). O banco gera o código de 4 dígitos e as credenciais vão para o WhatsApp.
   * - Cliente: o WhatsApp precisa ser o telefone do cadastro feito pela oficina (as credenciais só chegam
   *   ao dono daquele número); cria o login e vincula ao cadastro.
   * - Equipe: só para quem o gestor cadastrou sem senha (convite pendente) com este e-mail.
   * O código nunca volta na resposta: só pelo WhatsApp (ou com a equipe, em Clientes/Equipe).
   */
  async firstAccess(dto: FirstAccessDto, ip: string | undefined) {
    if ((await this.hit(`first-access:ip:${(ip || 'desconhecido').slice(0, 90)}`)) > LOGIN_MAX_FAILURES) throw this.tooMany();

    const whatsapp = normalizeWhatsapp(dto.whatsapp);
    if (!whatsapp) {
      throw new UnprocessableEntityException('WhatsApp inválido: informe DDD + número de celular (11 dígitos).');
    }
    if (dto.password !== dto.passwordConfirmation) {
      throw new UnprocessableEntityException('A confirmação não confere com a senha.');
    }
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 10);

    let user: { id: string; name: string; accessCode: string };
    if (dto.tab === 'CLIENTE') {
      if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new ConflictException('Já existe um acesso com este e-mail. Entre com seu código e senha.');
      }
      const matches = await this.prisma.$queryRaw<{ id: string; name: string; user_id: string | null }[]>`
        SELECT "id", "name", "user_id" FROM "clients"
         WHERE right(regexp_replace("phone", '[^0-9]', '', 'g'), 11) = ${whatsapp}
         ORDER BY "created_at" ASC LIMIT 1`;
      if (matches.length === 0) {
        throw new NotFoundException(
          'Não encontramos um cadastro com este WhatsApp. Fale com a oficina para registrar seu número.',
        );
      }
      const client = matches[0];
      if (client.user_id) {
        throw new ConflictException('Este cadastro já tem acesso. Entre com seu código ou peça à oficina para redefinir.');
      }
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { name: client.name, email, whatsapp, phone: whatsapp, passwordHash, role: UserRole.CLIENT },
          select: { id: true, name: true, accessCode: true },
        });
        // Condicional: dois cadastros simultâneos não vinculam o mesmo cliente
        const linked = await tx.client.updateMany({ where: { id: client.id, userId: null }, data: { userId: created.id } });
        if (linked.count !== 1) throw new ConflictException('Este cadastro acabou de receber um acesso. Entre com seu código.');
        return created;
      });
    } else {
      const staff = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, isActive: true, firstAccessPending: true },
      });
      if (!staff || staff.role === UserRole.CLIENT || !staff.isActive || !staff.firstAccessPending) {
        throw new NotFoundException(
          'Não há convite de primeiro acesso para este e-mail. Peça ao gestor para cadastrar você na tela Equipe.',
        );
      }
      const res = await this.prisma.user.updateMany({
        where: { id: staff.id, firstAccessPending: true },
        data: { passwordHash, whatsapp, phone: whatsapp, firstAccessPending: false },
      });
      if (res.count !== 1) throw new ConflictException('Este primeiro acesso já foi concluído. Entre com seu código.');
      user = await this.prisma.user.findUniqueOrThrow({ where: { id: staff.id }, select: { id: true, name: true, accessCode: true } });
    }

    const link = `${appPublicUrl()}/login?aba=${dto.tab === 'CLIENTE' ? 'cliente' : 'equipe'}`;
    const delivery = await this.whatsapp.sendCredentials(whatsapp, {
      name: user.name.split(' ')[0],
      accessCode: user.accessCode,
      password: dto.password,
      link,
    });
    return {
      created: true,
      whatsappSent: delivery.sent,
      whatsappMasked: `(${whatsapp.slice(0, 2)}) *****-${whatsapp.slice(-4)}`,
      accessLink: link,
    };
  }
}
