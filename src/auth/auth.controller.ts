import {
  Controller,
  Post,
  Get,
  Body,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterUserDto } from './dto/register.dto.js';
import { SetupAdminDto } from './dto/setup.dto.js';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Primeiro acesso: cria o administrador inicial.
   * Só funciona enquanto não existe nenhum usuário cadastrado.
   */
  @Public()
  @Get('setup')
  async setupStatus() {
    return { setupRequired: await this.authService.isSetupRequired() };
  }

  @Public()
  @Post('setup')
  async setup(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: SetupAdminDto,
  ) {
    return this.authService.setupFirstAdmin(dto);
  }

  @Public()
  @Post('login')
  async login(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  /** Cadastro de novos usuários da equipe: apenas administradores. */
  @Post('register')
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: RegisterUserDto,
  ) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem cadastrar usuários.');
    }
    return this.authService.register(dto);
  }

  @Get('me')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
