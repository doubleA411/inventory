ALTER TABLE "payments" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reversed_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_bill_payments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_bill_payments" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_bill_payments" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_payments" ADD CONSTRAINT "purchase_bill_payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;