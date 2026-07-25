ALTER TABLE "invoice_items" ADD COLUMN "menu_items" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "event_date" date;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "event_date" date;