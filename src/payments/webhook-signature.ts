import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida o cabeçalho x-signature do Mercado Pago ("ts=...,v1=...").
 * Manifesto oficial: "id:{data.id};request-id:{x-request-id};ts:{ts};" assinado com HMAC-SHA256
 * usando a chave secreta do webhook (MERCADO_PAGO_WEBHOOK_SECRET). Partes ausentes saem do manifesto.
 * Também recusa assinaturas com mais de 10 minutos (evita reenvio de notificações antigas).
 */
export function isValidMercadoPagoSignature(params: {
  secret: string;
  signatureHeader?: string;
  requestId?: string;
  dataId?: string;
  now?: number;
}): boolean {
  const { secret, signatureHeader, requestId, dataId } = params;
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;

  const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs((params.now ?? Date.now()) - tsMs) > 10 * 60 * 1000) return false;

  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = '';
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
