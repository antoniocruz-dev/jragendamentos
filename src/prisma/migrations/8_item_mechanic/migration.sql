-- Vários mecânicos por OS: cada serviço pode ter o seu mecânico (vazio = responsável da OS)
ALTER TABLE "work_order_items" ADD COLUMN "mechanic_id" UUID;

CREATE INDEX "work_order_items_mechanic_id_idx" ON "work_order_items"("mechanic_id");

ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_mechanic_id_fkey"
  FOREIGN KEY ("mechanic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
