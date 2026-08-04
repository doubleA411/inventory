ALTER TABLE "invoices" ADD COLUMN "show_menu_list" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bank_account_name" text;