-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'REFUNDED', 'WAIVED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('STOCK_SHORTAGE', 'PAYMENT_REJECTED');

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "refund_notes" TEXT,
ADD COLUMN     "refund_resolved_at" TIMESTAMP(3),
ADD COLUMN     "refund_resolved_by" VARCHAR(150),
ADD COLUMN     "refund_status" "RefundStatus",
ADD COLUMN     "stock_reserved" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "work_order_id" UUID,
    "user_name" VARCHAR(150),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_alerts" (
    "id" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "work_order_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key" VARCHAR(120) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "system_alerts_resolved_at_created_at_idx" ON "system_alerts"("resolved_at", "created_at");

-- CreateIndex
CREATE INDEX "work_orders_refund_status_idx" ON "work_orders"("refund_status");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: até aqui a baixa de estoque acontecia na criação da OS. As OS existentes já têm as
-- peças reservadas (as canceladas antes da conclusão já devolveram ao estoque).
UPDATE "work_orders" SET "stock_reserved" = true WHERE "status" <> 'CANCELLED';

-- Numeração legível: as próximas OS seguem a partir de #1001 (as antigas mantêm o número).
SELECT setval(
  pg_get_serial_sequence('"work_orders"', 'code'),
  GREATEST((SELECT COALESCE(MAX("code"), 0) FROM "work_orders"), 1000)
);
