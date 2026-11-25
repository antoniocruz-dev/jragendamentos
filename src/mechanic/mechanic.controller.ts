import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, ValidationPipe } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { MechanicArea } from '../auth/decorators/mechanic-area.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { MechanicService, type MechanicStatus } from './mechanic.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class MechanicStatusDto {
  @IsIn(['EM_EXECUCAO', 'AGUARDANDO_PECA', 'EM_TESTE', 'CONCLUIDA'], {
    message: 'status deve ser EM_EXECUCAO, AGUARDANDO_PECA, EM_TESTE ou CONCLUIDA.',
  })
  status: MechanicStatus;
}

export class ReopenDto {
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'A justificativa da reabertura é obrigatória (mín. 5 caracteres).' })
  @MaxLength(1000)
  justification: string;
}

export class ObservationDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Escreva a observação.' })
  @MaxLength(2000)
  message: string;
}

const pipe = new ValidationPipe({ transform: true, whitelist: true });

/** Portal do Mecânico: só o perfil Mecânico (e Administrador/Gerente Geral). Sem dados financeiros. */
@MechanicArea()
@Controller('mecanico')
export class MechanicController {
  constructor(private readonly service: MechanicService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string) {
    return this.service.dashboard(user, month);
  }

  @Get('os')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Get('os/:id')
  detail(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detail(user, id);
  }

  @Patch('os/:id/status')
  status(@Param('id', new ParseUUIDPipe()) id: string, @Body(pipe) dto: MechanicStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateStatus(user, id, dto.status);
  }

  @Post('os/:id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(@Param('id', new ParseUUIDPipe()) id: string, @Body(pipe) dto: ReopenDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reopen(user, id, dto.justification);
  }

  @Post('os/:id/observations')
  observation(@Param('id', new ParseUUIDPipe()) id: string, @Body(pipe) dto: ObservationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addObservation(user, id, dto.message);
  }
}
