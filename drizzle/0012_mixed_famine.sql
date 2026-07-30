ALTER TABLE "invoices" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_share_token_unique" UNIQUE("share_token");--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_share_token_unique" UNIQUE("share_token");