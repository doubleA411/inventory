CREATE TYPE "public"."payment_applied_to" AS ENUM('bill', 'opening_balance', 'credit');--> statement-breakpoint
ALTER TABLE "purchase_bill_payments" ADD COLUMN "applied_to" "payment_applied_to" DEFAULT 'bill' NOT NULL;--> statement-breakpoint
-- Backfill the classification that used to be inferred. Rows against a bill
-- are already 'bill' from the column default; the two unattached kinds are
-- told apart the old way (the magic note phrase) one final time.
UPDATE "purchase_bill_payments"
   SET "applied_to" = 'opening_balance'
 WHERE "purchase_bill_id" IS NULL
   AND "note" LIKE '%Applied to opening balance%';--> statement-breakpoint
UPDATE "purchase_bill_payments"
   SET "applied_to" = 'credit'
 WHERE "purchase_bill_id" IS NULL
   AND "applied_to" <> 'opening_balance';--> statement-breakpoint
-- Restore each vendor's opening balance to the figure originally entered.
-- It was previously decremented in place as it was paid off, so the column
-- currently holds only the unpaid remainder; adding back everything that was
-- allocated to it reconstructs what the caterer actually typed. Safe to run
-- once and only once, which is exactly what a migration is.
UPDATE "vendors" v
   SET "opening_balance" = v."opening_balance" + COALESCE((
         SELECT SUM(p."amount")
           FROM "purchase_bill_payments" p
          WHERE p."vendor_id" = v."id"
            AND p."applied_to" = 'opening_balance'
       ), 0);
