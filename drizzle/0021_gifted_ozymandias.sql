ALTER TABLE "purchase_bill_payments" ALTER COLUMN "purchase_bill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_bill_payments" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_bill_payments" ADD CONSTRAINT "purchase_bill_payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_bill_payments_vendor_idx" ON "purchase_bill_payments" USING btree ("vendor_id");--> statement-breakpoint
UPDATE "purchase_bill_payments" pbp
SET "vendor_id" = pb.vendor_id
FROM "purchase_bills" pb
WHERE pbp.purchase_bill_id = pb.id AND pbp.vendor_id IS NULL;