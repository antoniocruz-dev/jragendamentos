-- Entrada do cliente pelo painel (nome, e-mail e contato, sem senha): CPF/CNPJ passa a ser opcional
ALTER TABLE "clients" ALTER COLUMN "document" DROP NOT NULL;
