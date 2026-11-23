const DEV_FALLBACK_SECRET = 'chave_secreta_padrao_para_desenvolvimento';

/**
 * Segredo dos tokens JWT. Em produção (Vercel) é obrigatório: com a chave padrão
 * (pública no código) qualquer pessoa poderia forjar um token de administrador.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET não definido. Configure a variável de ambiente antes de subir a API.');
  }
  return DEV_FALLBACK_SECRET;
}
