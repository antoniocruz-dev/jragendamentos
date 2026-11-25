import { Controller, Post, Get, Body, ValidationPipe, Ip, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { SetupAdminDto } from './dto/setup.dto.js';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { AnyStaff } from './decorators/mechanic-area.decorator.js';
import { FirstAccessDto } from './dto/first-access.dto.js';

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
  @HttpCode(HttpStatus.OK)
  async login(
    @Ip() ip: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: LoginDto,
  ) {
    return this.authService.loginWithRateLimit(dto, ip);
  }

  /** Primeiro acesso de cliente ou da equipe: gera o código de 4 dígitos e envia pelo WhatsApp. */
  @Public()
  @Post('first-access')
  @HttpCode(HttpStatus.CREATED)
  async firstAccess(
    @Ip() ip: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: FirstAccessDto,
  ) {
    return this.authService.firstAccess(dto, ip);
  }

  // O cadastro de usuários da equipe fica em POST /team/users (Administrador e Gerente Geral).

  /** Dados do usuário logado, com perfil e módulos atuais (o front usa para montar o menu). */
  @AnyStaff()
  @Get('me')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
