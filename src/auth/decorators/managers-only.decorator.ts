import { SetMetadata } from '@nestjs/common';

export const MANAGERS_ONLY_KEY = 'managersOnly';

/**
 * Restringe a rota a Administrador e Gerente Geral.
 * Usado em todas as ações de excluir ou inativar cadastros.
 */
export const ManagersOnly = () => SetMetadata(MANAGERS_ONLY_KEY, true);
