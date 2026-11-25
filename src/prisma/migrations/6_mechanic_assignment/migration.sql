-- Atribuição/troca do mecânico responsável na OS fica registrada nas observações
ALTER TYPE "ObservationType" ADD VALUE IF NOT EXISTS 'ATRIBUICAO_MECANICO';

-- Filtro da lista de OS por mecânico
CREATE INDEX IF NOT EXISTS "work_orders_operator_id_idx" ON "work_orders"("operator_id");
