CREATE TYPE "public"."activity_action" AS ENUM('payment_reversed', 'vendor_payment_reversed');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action" "activity_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"invoice_id" uuid,
	"vendor_id" uuid,
	"amount" numeric(14, 2),
	"summary" text NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_org_idx" ON "activity_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_log_invoice_idx" ON "activity_log" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "activity_log_vendor_idx" ON "activity_log" USING btree ("vendor_id");