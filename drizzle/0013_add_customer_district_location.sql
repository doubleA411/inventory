ALTER TABLE "customers" RENAME COLUMN "city" TO "district";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "location" text;--> statement-breakpoint
UPDATE "customers" SET "district" = 'Chennai' WHERE "district" IS NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "district" SET DEFAULT 'Chennai';--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "district" SET NOT NULL;