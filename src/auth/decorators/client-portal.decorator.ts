import { SetMetadata } from '@nestjs/common';

export const CLIENT_PORTAL_KEY = 'clientPortal';

/** Rota do Portal do Cliente: só usuários com papel CLIENT (a equipe recebe 403). */
export const ClientPortal = () => SetMetadata(CLIENT_PORTAL_KEY, true);
