import { getJwtSecret } from './jwt-secret.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { StaffAuthGuard } from './guards/staff-auth.guard.js';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Protege TODAS as rotas da API por padrão; exceções usam @Public()
    { provide: APP_GUARD, useClass: StaffAuthGuard },
  ],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
