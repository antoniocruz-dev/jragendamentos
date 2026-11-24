-- CreateEnum
CREATE TYPE "ExpensePayer" AS ENUM ('CAIXA', 'SOCIO');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI');

-- AlterTable
ALTER TABLE "cash_transactions" ADD COLUMN     "beneficiary_id" UUID,
ADD COLUMN     "description" VARCHAR(255),
ADD COLUMN     "installments" INTEGER,
ADD COLUMN     "paid_by" "ExpensePayer";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "work_order_items" ADD COLUMN     "unit_cost" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "billed_at" TIMESTAMP(3),
ADD COLUMN     "commission_rate" DECIMAL(5,2),
ADD COLUMN     "installments" INTEGER,
ADD COLUMN     "iss_rate" DECIMAL(5,2),
ADD COLUMN     "payment_method" "PaymentMethod";

-- CreateTable
CREATE TABLE "financial_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tax_regime" "TaxRegime" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "iss_rate" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "municipality" VARCHAR(100) NOT NULL DEFAULT 'Parauapebas/PA',
    "service_code" VARCHAR(10) NOT NULL DEFAULT '14.01',
    "company_name" VARCHAR(150) NOT NULL DEFAULT 'JR Garage Center',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_orders_billed_at_idx" ON "work_orders"("billed_at");

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ==========================================
-- Dados existentes (backfill)
-- ==========================================

-- Custo de saída das peças já usadas: custo atual da peça (não havia histórico de custo)
UPDATE "work_order_items" i
SET "unit_cost" = p."cost_price"
FROM "products" p
WHERE i."product_id" = p."id";

-- OS já faturadas: data e forma do recebimento (lançamento de caixa), alíquotas vigentes
UPDATE "work_orders" w
SET "billed_at" = COALESCE(
      (SELECT MIN(c."paid_at") FROM "cash_transactions" c
        WHERE c."work_order_id" = w."id" AND c."type" = 'INCOME' AND c."status" = 'PAID'),
      w."finished_at",
      w."updated_at"),
    "payment_method" = (SELECT c."payment_method" FROM "cash_transactions" c
        WHERE c."work_order_id" = w."id" AND c."type" = 'INCOME'
        ORDER BY c."paid_at" ASC NULLS LAST LIMIT 1),
    "iss_rate" = 5.00,
    "commission_rate" = (SELECT u."commission_rate" FROM "users" u WHERE u."id" = w."operator_id")
WHERE w."status" = 'BILLED';

-- Configuração fiscal inicial: Parauapebas/PA, item 14.01, ISS 5%
INSERT INTO "financial_settings" ("id", "updated_at") VALUES (1, NOW()) ON CONFLICT ("id") DO NOTHING;
