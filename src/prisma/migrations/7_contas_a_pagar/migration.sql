-- Contas a pagar: vencimento das despesas (status PENDING até a baixa).
-- Registros existentes continuam PAID e sem vencimento.

-- AlterTable
ALTER TABLE "cash_transactions" ADD COLUMN     "due_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "cash_transactions_due_date_idx" ON "cash_transactions"("due_date");
