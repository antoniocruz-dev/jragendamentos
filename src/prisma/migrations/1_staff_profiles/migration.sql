-- CreateEnum
CREATE TYPE "StaffProfile" AS ENUM ('ADMINISTRADOR', 'GERENTE_GERAL', 'MECANICO_CHEFE', 'MECANICO', 'AUXILIAR_OFICINA', 'AUXILIAR_ADMINISTRATIVO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profile" "StaffProfile";

-- CreateTable
CREATE TABLE "profile_permissions" (
    "profile" "StaffProfile" NOT NULL,
    "modules" TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_permissions_pkey" PRIMARY KEY ("profile")
);


-- ==========================================================
-- Dados iniciais (editáveis depois na tela Equipe)
-- ==========================================================

-- Permissões padrão por perfil. ADMINISTRADOR tem acesso total no código,
-- a linha existe só para a tela listar todos os perfis.
INSERT INTO "profile_permissions" ("profile", "modules", "updated_at") VALUES
  ('ADMINISTRADOR',           ARRAY['DASHBOARD','WORK_ORDERS','CLIENTS','CATALOG','APPOINTMENTS','FINANCIAL'], CURRENT_TIMESTAMP),
  ('GERENTE_GERAL',           ARRAY['DASHBOARD','WORK_ORDERS','CLIENTS','CATALOG','APPOINTMENTS','FINANCIAL'], CURRENT_TIMESTAMP),
  ('MECANICO_CHEFE',          ARRAY['DASHBOARD','WORK_ORDERS','CLIENTS','CATALOG','APPOINTMENTS'],             CURRENT_TIMESTAMP),
  ('MECANICO',                ARRAY['DASHBOARD','WORK_ORDERS'],                                                CURRENT_TIMESTAMP),
  ('AUXILIAR_OFICINA',        ARRAY['WORK_ORDERS','CATALOG'],                                                  CURRENT_TIMESTAMP),
  ('AUXILIAR_ADMINISTRATIVO', ARRAY['DASHBOARD','CLIENTS','APPOINTMENTS','FINANCIAL'],                        CURRENT_TIMESTAMP)
ON CONFLICT ("profile") DO NOTHING;

-- Usuários da equipe que já existiam ganham um cargo compatível com o papel atual
UPDATE "users" SET "profile" = 'ADMINISTRADOR' WHERE "role" = 'ADMIN'    AND "profile" IS NULL;
UPDATE "users" SET "profile" = 'MECANICO'      WHERE "role" = 'OPERATOR' AND "profile" IS NULL;
