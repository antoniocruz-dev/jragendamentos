import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizePhone } from './roles.js';

/**
 * Regra global: nunca permitir cadastros duplicados (agent_docs/business-rules.md).
 * As checagens ficam na aplicação porque a comparação ignora acentos, maiúsculas e a formatação
 * do telefone, o que um índice único simples do banco não faz.
 */

/** Nome para comparação: sem acentos, minúsculo e com espaços simples. */
export function comparableName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Serializa cadastros que disputam a mesma chave (dois cliques em "Salvar", duas pessoas ao mesmo tempo):
 * a segunda transação espera a primeira terminar e então enxerga o registro já criado.
 */
export async function lockKey(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Recusa (409) um nome de serviço/peça que já existe, ignorando acentos e maiúsculas. */
export function assertNameFree(
  existing: { id: string; name: string; isActive: boolean }[],
  name: string,
  ignoreId: string | undefined,
  label: 'serviço' | 'peça',
) {
  const target = comparableName(name);
  const conflict = existing.find((e) => e.id !== ignoreId && comparableName(e.name) === target);
  if (!conflict) return;
  const article = label === 'serviço' ? 'um' : 'uma';
  const hint = conflict.isActive
    ? ''
    : label === 'serviço'
      ? ' Ele está inativo: reative-o em vez de cadastrar de novo.'
      : ' Ela está inativa: reative-a em vez de cadastrar de novo.';
  throw new ConflictException(`Já existe ${article} ${label} com o nome "${conflict.name}".${hint}`);
}

/**
 * Recusa (409) telefone ou e-mail já usados por outro cliente.
 * Mesma comparação do "Primeiro acesso" do portal (src/auth/auth.service.ts): só dígitos, com ou sem 55.
 */
export async function assertClientContactFree(
  tx: Prisma.TransactionClient,
  contact: { phone?: string | null; email?: string | null },
  ignoreId?: string,
) {
  const phone = normalizePhone(contact.phone) ?? (contact.phone ?? '').replace(/\D/g, '');
  if (phone) {
    const byPhone = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "clients"
       WHERE regexp_replace("phone", '[^0-9]', '', 'g') IN (${phone}, ${'55' + phone})
         AND (${ignoreId ?? null}::uuid IS NULL OR "id" <> ${ignoreId ?? null}::uuid)
       LIMIT 1`;
    if (byPhone.length) throw new ConflictException('Já existe um cliente cadastrado com este telefone.');
  }

  const email = contact.email?.trim();
  if (email) {
    const byEmail = await tx.client.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      select: { id: true },
    });
    if (byEmail) throw new ConflictException('Já existe um cliente cadastrado com este e-mail.');
  }
}
