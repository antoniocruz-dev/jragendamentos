import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca uma rota (ou controller inteiro) como pública: o StaffAuthGuard global
 * deixa passar sem token. Use só no que precisa ser acessado sem login
 * (login, primeiro acesso, webhook do Mercado Pago, link da OS enviado ao cliente).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
