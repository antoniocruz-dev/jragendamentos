import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffProfile, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  MODULE_LABELS,
  PROFILE_LABELS,
  PROFILE_ORDER,
  SYSTEM_MODULES,
  TEAM_MANAGER_PROFILES,
  effectiveProfile,
  roleForProfile,
} from '../auth/permissions.js';
import { CreateTeamUserDto, UpdateProfilePermissionsDto, UpdateTeamUserDto } from './dto/team.dto.js';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  profile: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // ==========================================
  // USUÁRIOS
  // ==========================================

  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.ADMIN, UserRole.OPERATOR] } },
      select: USER_SELECT,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return users.map((u) => ({ ...u, profile: effectiveProfile(u.role, u.profile) }));
  }

  async createUser(actor: AuthenticatedUser, dto: CreateTeamUserDto) {
    this.assertCanAssignProfile(actor, dto.profile);
    return this.authService.register(dto);
  }

  async updateUser(actor: AuthenticatedUser, id: string, dto: UpdateTeamUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!target || target.role === UserRole.CLIENT) {
      throw new NotFoundException('Usuário da equipe não encontrado.');
    }

    const currentProfile = effectiveProfile(target.role, target.profile);
    const isSelf = actor.id === id;

    // Gerente Geral não altera contas de Administrador
    if (currentProfile === StaffProfile.ADMINISTRADOR && actor.profile !== StaffProfile.ADMINISTRADOR) {
      throw new ForbiddenException('Somente um Administrador pode alterar outro Administrador.');
    }
    if (dto.profile) this.assertCanAssignProfile(actor, dto.profile);

    // Evita que o gestor se tranque fora do sistema
    if (isSelf && dto.isActive === false) {
      throw new BadRequestException('Você não pode desativar a sua própria conta.');
    }
    if (isSelf && dto.profile && dto.profile !== currentProfile) {
      throw new BadRequestException('Você não pode alterar o seu próprio perfil.');
    }

    // Sempre precisa sobrar pelo menos um Administrador ativo
    const losesAdmin =
      currentProfile === StaffProfile.ADMINISTRADOR &&
      ((dto.profile && dto.profile !== StaffProfile.ADMINISTRADOR) || dto.isActive === false);
    if (losesAdmin) {
      const otherAdmins = await this.prisma.user.count({
        where: {
          id: { not: id },
          isActive: true,
          OR: [{ profile: StaffProfile.ADMINISTRADOR }, { role: UserRole.ADMIN, profile: null }],
        },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException('O sistema precisa de pelo menos um Administrador ativo.');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const conflict = await this.prisma.user.findFirst({ where: { email, id: { not: id } } });
      if (conflict) throw new ConflictException('Este e-mail já está em uso por outro usuário.');
      data.email = email;
    }
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.profile) {
      data.profile = dto.profile;
      data.role = roleForProfile(dto.profile);
    }
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const updated = await this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
    return { ...updated, profile: effectiveProfile(updated.role, updated.profile) };
  }

  /**
   * Exclui o usuário da equipe. As OS em que ele era o operador ficam sem operador
   * (o histórico da OS é mantido). Mesmas travas da desativação.
   */
  async removeUser(actor: AuthenticatedUser, id: string) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!target || target.role === UserRole.CLIENT) {
      throw new NotFoundException('Usuário da equipe não encontrado.');
    }
    if (actor.id === id) {
      throw new BadRequestException('Você não pode excluir a sua própria conta.');
    }

    const profile = effectiveProfile(target.role, target.profile);
    if (profile === StaffProfile.ADMINISTRADOR) {
      if (actor.profile !== StaffProfile.ADMINISTRADOR) {
        throw new ForbiddenException('Somente um Administrador pode excluir outro Administrador.');
      }
      const otherAdmins = await this.prisma.user.count({
        where: {
          id: { not: id },
          isActive: true,
          OR: [{ profile: StaffProfile.ADMINISTRADOR }, { role: UserRole.ADMIN, profile: null }],
        },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException('O sistema precisa de pelo menos um Administrador ativo.');
      }
    }

    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  // ==========================================
  // PERFIS E PERMISSÕES
  // ==========================================

  async listProfiles() {
    const [perms, counts] = await Promise.all([
      this.prisma.profilePermission.findMany(),
      this.prisma.user.groupBy({
        by: ['profile'],
        where: { isActive: true, role: { not: UserRole.CLIENT } },
        _count: { _all: true },
      }),
    ]);

    const profiles = PROFILE_ORDER.map((profile) => {
      const locked = profile === StaffProfile.ADMINISTRADOR;
      const configured = perms.find((p) => p.profile === profile)?.modules ?? [];
      return {
        profile,
        label: PROFILE_LABELS[profile],
        // Administrador: acesso total, não editável
        modules: locked ? [...SYSTEM_MODULES] : configured.filter((m) => SYSTEM_MODULES.includes(m as never)),
        locked,
        canManageTeam: TEAM_MANAGER_PROFILES.includes(profile),
        activeUsers: counts.find((c) => c.profile === profile)?._count._all ?? 0,
      };
    });

    return {
      modules: SYSTEM_MODULES.map((key) => ({ key, label: MODULE_LABELS[key] })),
      profiles,
    };
  }

  async updateProfile(profile: StaffProfile, dto: UpdateProfilePermissionsDto) {
    if (profile === StaffProfile.ADMINISTRADOR) {
      throw new BadRequestException('O perfil Administrador tem acesso total e não pode ser alterado.');
    }

    await this.prisma.profilePermission.upsert({
      where: { profile },
      create: { profile, modules: dto.modules },
      update: { modules: dto.modules },
    });
    return this.listProfiles();
  }

  // ==========================================
  // AUXILIARES
  // ==========================================

  /** Só um Administrador pode criar ou promover alguém a Administrador. */
  private assertCanAssignProfile(actor: AuthenticatedUser, profile: StaffProfile) {
    if (profile === StaffProfile.ADMINISTRADOR && actor.profile !== StaffProfile.ADMINISTRADOR) {
      throw new ForbiddenException('Somente um Administrador pode cadastrar outro Administrador.');
    }
  }
}
