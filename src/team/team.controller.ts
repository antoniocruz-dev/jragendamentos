import { ManagersOnly } from '../auth/decorators/managers-only.decorator.js';
import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { StaffProfile } from '@prisma/client';
import { TeamService } from './team.service.js';
import { CreateTeamUserDto, UpdateProfilePermissionsDto, UpdateTeamUserDto } from './dto/team.dto.js';
import { RequireModules } from '../auth/decorators/require-modules.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { TEAM_MODULE } from '../auth/permissions.js';

/**
 * Gestão da equipe e dos perfis de acesso.
 * O módulo TEAM só existe para Administrador e Gerente Geral.
 */
@RequireModules(TEAM_MODULE)
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('users')
  listUsers() {
    return this.teamService.listUsers();
  }

  @Post('users')
  createUser(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTeamUserDto) {
    return this.teamService.createUser(actor, dto);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTeamUserDto,
  ) {
    return this.teamService.updateUser(actor, id, dto);
  }

  @ManagersOnly()
  @Delete('users/:id')
  removeUser(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.teamService.removeUser(actor, id);
  }

  @Get('profiles')
  listProfiles() {
    return this.teamService.listProfiles();
  }

  @Put('profiles/:profile')
  updateProfile(
    @Param('profile', new ParseEnumPipe(StaffProfile)) profile: StaffProfile,
    @Body() dto: UpdateProfilePermissionsDto,
  ) {
    return this.teamService.updateProfile(profile, dto);
  }
}
