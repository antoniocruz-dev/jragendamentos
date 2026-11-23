import { SetMetadata } from '@nestjs/common';
import type { AppModule } from '../permissions.js';

export const REQUIRED_MODULES_KEY = 'requiredModules';

/**
 * Exige que o perfil do usuário tenha acesso a PELO MENOS UM dos módulos informados.
 * Ex.: @RequireModules('CLIENTS', 'APPOINTMENTS') — a lista de clientes também é usada
 * pela tela de Agendamentos.
 */
export const RequireModules = (...modules: AppModule[]) => SetMetadata(REQUIRED_MODULES_KEY, modules);
