-- Portal do Cliente / Portal do Mecânico (SPEC-front-end)

-- Status "Em teste" da OS
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'TESTING' BEFORE 'COMPLETED';

CREATE TYPE "BudgetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ObservationType" AS ENUM ('ORCAMENTO_CLIENTE', 'TECNICA_MECANICO', 'REABERTURA');
CREATE TYPE "ObservationAuthorRole" AS ENUM ('CLIENTE', 'MECANICO', 'GESTOR', 'ADMIN');

-- Código de acesso de 4 dígitos (0000-9999), único, sorteado pelo banco
CREATE OR REPLACE FUNCTION gen_access_code() RETURNS char(4) LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  c char(4);
  tries int := 0;
BEGIN
  LOOP
    c := lpad(floor(random() * 10000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "users" WHERE "access_code" = c);
    tries := tries + 1;
    IF tries >= 50 THEN
      -- Muitos códigos em uso: sorteia entre os livres
      SELECT lpad(n::text, 4, '0') INTO c
        FROM generate_series(0, 9999) AS n
       WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."access_code" = lpad(n::text, 4, '0'))
       ORDER BY random()
       LIMIT 1;
      IF c IS NULL THEN
        RAISE EXCEPTION 'Não há mais códigos de acesso livres (0000-9999).';
      END IF;
      EXIT;
    END IF;
  END LOOP;
  RETURN c;
END
$$;

ALTER TABLE "users"
  ADD COLUMN "access_code" CHAR(4),
  ADD COLUMN "whatsapp" VARCHAR(20),
  ADD COLUMN "first_access_pending" BOOLEAN NOT NULL DEFAULT false;

-- Um UPDATE por linha: cada sorteio enxerga os códigos já gravados
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT "id" FROM "users" WHERE "access_code" IS NULL ORDER BY "created_at" LOOP
    UPDATE "users" SET "access_code" = gen_access_code() WHERE "id" = r."id";
  END LOOP;
END
$$;

ALTER TABLE "users" ALTER COLUMN "access_code" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "access_code" SET DEFAULT gen_access_code();
CREATE UNIQUE INDEX "users_access_code_key" ON "users"("access_code");

-- WhatsApp inicial = telefone já cadastrado (só dígitos)
UPDATE "users" SET "whatsapp" = regexp_replace("phone", '\D', '', 'g') WHERE "phone" IS NOT NULL;

-- OS: decisão do orçamento e reaberturas
ALTER TABLE "work_orders"
  ADD COLUMN "budget_status" "BudgetStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reopen_count" INTEGER NOT NULL DEFAULT 0;

UPDATE "work_orders" SET "budget_status" = 'APPROVED'
 WHERE "status" IN ('APPROVED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'BILLED');

CREATE TABLE "os_observations" (
  "id" UUID NOT NULL,
  "os_id" UUID NOT NULL,
  "author_id" UUID,
  "author_name" VARCHAR(150) NOT NULL,
  "author_role" "ObservationAuthorRole" NOT NULL,
  "type" "ObservationType" NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "os_observations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "os_observations_os_id_created_at_idx" ON "os_observations"("os_id", "created_at");
ALTER TABLE "os_observations" ADD CONSTRAINT "os_observations_os_id_fkey"
  FOREIGN KEY ("os_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "os_observations" ADD CONSTRAINT "os_observations_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Agendamento: serviço pedido
ALTER TABLE "appointments" ADD COLUMN "service_type" VARCHAR(255);
