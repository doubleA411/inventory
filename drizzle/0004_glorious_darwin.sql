ALTER TABLE "stock_movements" ADD COLUMN "unit_cost" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "cost_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;