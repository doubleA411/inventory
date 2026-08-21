ALTER TABLE "stock_movements" ADD COLUMN "quotation_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movements_quotation_idx" ON "stock_movements" USING btree ("quotation_id");--> statement-breakpoint
-- Give every historical usage row the event it was really for. Attribution
-- previously ran through the invoice, so the link already exists — it just has
-- to be followed one hop: movement -> invoice -> quotation. Nothing is lost and
-- no existing figure changes; rows that were already attributable stay
-- attributable, and rows that never had an invoice simply stay unattributed.
UPDATE "stock_movements" m
   SET "quotation_id" = i."quotation_id"
  FROM "invoices" i
 WHERE m."invoice_id" = i."id"
   AND i."quotation_id" IS NOT NULL
   AND m."quotation_id" IS NULL;
