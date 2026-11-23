import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
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

  /** Cria o primeiro ADMIN. Recusa se já houver qualquer usuário (evita tomada de controle). */
  async setupFirstAdmin(dto: SetupAdminDto) {
    if (!(await this.isSetupRequired())) {
      throw new ForbiddenException('O sistema já foi configurado. Faça login com um administrador.');
    }

    await this.register({ ...dto, profile: StaffProfile.ADMINISTRADOR });
    return this.login({ email: dto.email, password: dto.password });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas ou conta inativa.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const { profile, modules } = await loadUserModules(this.prisma, user.role, user.profile);

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile,
        modules,
      },
    };
  }
}
