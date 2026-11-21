import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: RegisterUserDto,
  ) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
