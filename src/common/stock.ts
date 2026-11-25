import { Prisma, WorkOrderItemType } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface StockShortage {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

/** Erro interno usado para desfazer a transação quando falta peça. */
export class InsufficientStockError extends Error {
  constructor(public readonly shortages: StockShortage[]) {
    super('Estoque insuficiente');
  }
}

/** Soma as quantidades por peça (a mesma peça pode aparecer em mais de um item). */
function productQuantities(items: { itemType: WorkOrderItemType; productId: string | null; quantity: number }[]) {
  const map = new Map<string, number>();
  for (const it of items) {
    if (it.itemType === WorkOrderItemType.PRODUCT && it.productId) {
      map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
    }
  }
  return map;
}

/**
 * Baixa atômica das peças de uma OS. Cada baixa é um UPDATE condicional (estoque >= quantidade),
 * então duas OS disputando a última unidade não deixam o estoque negativo: a segunda falha.
 * Se qualquer peça faltar, lança InsufficientStockError (a transação inteira é desfeita).
 */
export async function reserveWorkOrderStock(
  tx: Tx,
  workOrder: { id: string; code: number; items: { itemType: WorkOrderItemType; productId: string | null; quantity: number }[] },
  userName?: string | null,
) {
  const shortages: StockShortage[] = [];
  for (const [productId, qty] of productQuantities(workOrder.items)) {
    const res = await tx.product.updateMany({
      where: { id: productId, stockQuantity: { gte: qty } },
      data: { stockQuantity: { decrement: qty } },
    });
    const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true, stockQuantity: true } });
    if (res.count === 0) {
      shortages.push({ productId, name: product?.name ?? productId, requested: qty, available: product?.stockQuantity ?? 0 });
      continue;
    }
    await tx.stockMovement.create({
      data: {
        productId,
        quantity: -qty,
        balance: product!.stockQuantity,
        reason: `Baixa pela aprovação da OS #${workOrder.code}`,
        workOrderId: workOrder.id,
        userName: userName ?? null,
      },
    });
  }
  if (shortages.length) throw new InsufficientStockError(shortages);
}

/** Devolve ao estoque as peças de uma OS (cancelamento ou estorno). */
export async function returnWorkOrderStock(
  tx: Tx,
  workOrder: { id: string; code: number; items: { itemType: WorkOrderItemType; productId: string | null; quantity: number }[] },
  reason: string,
  userName?: string | null,
) {
  for (const [productId, qty] of productQuantities(workOrder.items)) {
    const product = await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: { increment: qty } },
      select: { stockQuantity: true },
    });
    await tx.stockMovement.create({
      data: { productId, quantity: qty, balance: product.stockQuantity, reason, workOrderId: workOrder.id, userName: userName ?? null },
    });
  }
}

export function shortageText(shortages: StockShortage[]) {
  return shortages.map((s) => `${s.name} (pedido ${s.requested}, disponível ${s.available})`).join('; ');
}
