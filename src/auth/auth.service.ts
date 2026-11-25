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
import { ClientEntryDto } from './dto/client-entry.dto.js';
import { normalizePhone, normalizeWhatsapp, specRole } from '../common/roles.js';

/** Limite contra força bruta: 5 tentativas FALHAS por IP e por código a cada 15 minutos. */
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;


@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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
      throw new UnauthorizedException('Informe o usuário (código de 4 dígitos) e a senha.');
    }
    const user = dto.accessCode
      ? await this.prisma.user.findUnique({ where: { accessCode: dto.accessCode } })
      : await this.prisma.user.findUnique({ where: { email: dto.email!.toLowerCase() } });

    // Mesma mensagem para código inexistente e senha errada (não revela qual dos dois falhou)
    const isPasswordValid = user && !user.firstAccessPending ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException(dto.accessCode ? 'Usuário ou senha inválidos.' : 'E-mail ou senha inválidos.');
    }
    // Login com senha é só da equipe: o cliente entra pela aba Cliente (nome, e-mail e contato)
    if (user.role === UserRole.CLIENT) {
      throw new UnauthorizedException('Clientes entram pela aba "Cliente", com nome, e-mail e contato.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Conta desativada. Fale com a oficina para reativar o acesso.');
    }
    return this.issueSession(user);
  }

  /** Gera o token e os dados da sessão (equipe ou cliente). */
  private async issueSession(user: { id: string; name: string; email: string; role: UserRole; profile: StaffProfile | null; accessCode: string }) {
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
  // ENTRADA DO CLIENTE (sem senha)
  // ==========================================

  /**
   * O cliente entra no painel informando nome completo, e-mail e contato (sem senha).
   * - Contato e/ou e-mail já cadastrados pela oficina: os dois precisam conferir com o mesmo cadastro
   *   (se um deles apontar para outro cliente, a entrada é recusada e conta como falha).
   * - Cliente novo: o cadastro é criado com esses dados (CPF/CNPJ fica para a oficina completar).
   * Limite: 5 falhas por IP a cada 15 minutos; 10 cadastros novos por IP na mesma janela.
   */
  async clientEntry(dto: ClientEntryDto, ip: string | undefined) {
    const ipKey = (ip || 'desconhecido').slice(0, 90);
    const failKey = `client-entry:fail:${ipKey}`;
    const failures = await this.hit(failKey);
    if (failures > LOGIN_MAX_FAILURES) throw this.tooMany();

    const phone = normalizePhone(dto.phone);
    if (!phone) {
      throw new UnprocessableEntityException('Contato inválido: informe o telefone com DDD (10 ou 11 dígitos).');
    }
    const email = dto.email.trim().toLowerCase();

    // Trava por contato e por e-mail (sempre nessa ordem): entradas simultâneas do mesmo
    // cliente novo esperam umas pelas outras e não criam cadastros duplicados
    const clientId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'client-entry:p:' + phone}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'client-entry:e:' + email}))`;
      let clientId: string;
      const byPhone = await tx.$queryRaw<{ id: string; email: string | null }[]>`
        SELECT "id", "email" FROM "clients"
         WHERE regexp_replace("phone", '[^0-9]', '', 'g') IN (${phone}, ${'55' + phone})
         ORDER BY "created_at" ASC LIMIT 1`;
      const byEmail = await tx.client.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      const mismatch = () =>
        new UnauthorizedException(
          'Os dados não conferem com o cadastro da oficina. Confira o e-mail e o contato ou fale com a oficina.',
        );
      if (byPhone[0]) {
        const c = byPhone[0];
        if ((c.email && c.email.toLowerCase() !== email) || (byEmail && byEmail.id !== c.id)) throw mismatch();
        clientId = c.id;
        if (!c.email) await tx.client.update({ where: { id: c.id }, data: { email } });
      } else if (byEmail) {
        throw mismatch();
      } else {
        if ((await this.hit(`client-entry:new:${ipKey}`)) > 10) throw this.tooMany();
        const created = await tx.client.create({
          data: { name: dto.name, email, phone },
          select: { id: true },
        });
        clientId = created.id;
      }

      return clientId;
    });

    const user = await this.ensureClientUser(clientId, email);
    if (!user.isActive) {
      throw new UnauthorizedException('Seu acesso está bloqueado. Fale com a oficina.');
    }
    await this.release(failKey);
    return this.issueSession(user);
  }

  /** Login técnico do cliente (papel CLIENT), criado na primeira entrada e vinculado ao cadastro. */
  private async ensureClientUser(clientId: string, email: string) {
    return this.prisma.$transaction(async (tx) => {
      // Trava o cadastro: duas entradas simultâneas não criam dois logins
      await tx.$queryRaw`SELECT id FROM "clients" WHERE id = ${clientId}::uuid FOR UPDATE`;
      const client = await tx.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, phone: true, userId: true } });
      if (client.userId) return tx.user.findUniqueOrThrow({ where: { id: client.userId } });
      // users.email é único (também usado no login da equipe): se já estiver em uso, usa um endereço interno
      const taken = await tx.user.findUnique({ where: { email }, select: { id: true } });
      const user = await tx.user.create({
        data: {
          name: client.name,
          email: taken ? `cliente-${clientId}@clientes.local` : email,
          phone: client.phone,
          passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
          role: UserRole.CLIENT,
        },
      });
      await tx.client.update({ where: { id: clientId }, data: { userId: user.id } });
      return user;
    });
  }

  // ==========================================
  // PRIMEIRO ACESSO DA EQUIPE
  // ==========================================

  /**
   * Quem o gestor cadastrou na tela Equipe (convite pendente) cadastra a própria senha com o e-mail
   * do convite. A resposta traz o usuário (código de 4 dígitos), para entrar com código ou e-mail.
   */
  async firstAccess(dto: FirstAccessDto, ip: string | undefined) {
    if ((await this.hit(`first-access:ip:${(ip || 'desconhecido').slice(0, 90)}`)) > LOGIN_MAX_FAILURES) throw this.tooMany();
    if (dto.password !== dto.passwordConfirmation) {
      throw new UnprocessableEntityException('A confirmação não confere com a senha.');
    }
    const email = dto.email.trim().toLowerCase();
    const staff = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, isActive: true, firstAccessPending: true },
    });
    if (!staff || staff.role === UserRole.CLIENT || !staff.isActive || !staff.firstAccessPending) {
      throw new NotFoundException(
        'Não há convite de primeiro acesso para este e-mail. Peça ao gestor para cadastrar você na tela Equipe.',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const res = await this.prisma.user.updateMany({
      where: { id: staff.id, firstAccessPending: true },
      data: { passwordHash, firstAccessPending: false },
    });
    if (res.count !== 1) throw new ConflictException('Este primeiro acesso já foi concluído. Entre com seu usuário e senha.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: staff.id }, select: { name: true, accessCode: true } });
    return { created: true, name: user.name, accessCode: user.accessCode };
  }
}
